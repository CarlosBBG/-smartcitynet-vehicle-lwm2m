import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Vehicle, VehicleStatus } from '@prisma/client';

import { AlertsService } from '../alerts/alerts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProvisioningSignalService } from '../provisioning/provisioning-signal.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { BridgeDevice } from './bridge.types.js';
import { BridgeService } from './bridge.service.js';

@Injectable()
export class BridgeSyncService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BridgeSyncService.name);
  private readonly intervalMs: number;
  private readonly offlineThresholdMs: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly bridge: BridgeService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly provisioningSignals: ProvisioningSignalService,
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
  ) {
    this.intervalMs = config.get<number>('BRIDGE_SYNC_INTERVAL_MS', 2000);
    this.offlineThresholdMs =
      config.get<number>('OFFLINE_THRESHOLD_SECONDS', 120) * 1000;
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    void this.syncOnce();
    this.timer = setInterval(() => void this.syncOnce(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async syncOnce(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const [devices, vehicles] = await Promise.all([
        this.bridge.getDevices(),
        this.prisma.vehicle.findMany({ where: { deletedAt: null } }),
      ]);
      const devicesById = new Map(
        devices.map((device) => [device.device_id, device]),
      );

      for (const vehicle of vehicles) {
        try {
          await this.syncVehicle(vehicle, devicesById.get(vehicle.deviceId));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `No se pudo sincronizar ${vehicle.deviceId}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sincronización con Bridge omitida: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async syncVehicle(
    vehicle: Vehicle,
    device?: BridgeDevice,
  ): Promise<void> {
    if (!vehicle.enabled) {
      const updated = await this.updateVehicleIfChanged(vehicle, {
        status: VehicleStatus.DISABLED,
      });
      await this.alerts.evaluateVehicle(updated);
      return;
    }

    if (!device) {
      const updated = await this.updateVehicleIfChanged(vehicle, {
        status: VehicleStatus.PENDING_DISCOVERY,
      });
      await this.alerts.evaluateVehicle(updated);
      return;
    }

    const receivedAt = new Date(device.last_seen);
    if (Number.isNaN(receivedAt.getTime())) {
      this.logger.warn(
        `Bridge devolvió last_seen inválido para ${device.device_id}`,
      );
      return;
    }

    const uplinkCounter = integerOrNull(device.state.uplink_counter);
    const discoveredNow =
      vehicle.status === VehicleStatus.PENDING_DISCOVERY ||
      vehicle.lastSeen === null;
    const telemetryIsRecent =
      Date.now() - receivedAt.getTime() <= this.offlineThresholdMs;
    const status = telemetryIsRecent
      ? vehicle.status === VehicleStatus.ONLINE
        ? VehicleStatus.ONLINE
        : VehicleStatus.LWM2M_DISCONNECTED
      : VehicleStatus.OFFLINE;
    const data = {
      status,
      lastSeen: receivedAt,
      lastUplinkCounter: uplinkCounter ?? vehicle.lastUplinkCounter,
      ...(vehicle.devEui === null && device.dev_eui
        ? { devEui: device.dev_eui }
        : {}),
    };

    if (!this.isNewTelemetry(vehicle, receivedAt, uplinkCounter)) {
      const updated = await this.updateVehicleIfChanged(vehicle, data);
      await this.alerts.evaluateVehicle(updated);
      if (discoveredNow) {
        this.provisioningSignals.request(vehicle.id);
      }
      return;
    }

    const [telemetry, updatedVehicle] = await this.prisma.$transaction([
      this.prisma.telemetry.create({
        data: this.mapTelemetry(vehicle.id, device, receivedAt),
      }),
      this.prisma.vehicle.update({ where: { id: vehicle.id }, data }),
    ]);
    this.realtime.emitTelemetryReceived(vehicle.id, telemetry);
    this.realtime.emitVehicleUpdated(updatedVehicle);
    await this.alerts.evaluateVehicle(updatedVehicle, telemetry);
    if (discoveredNow) {
      this.provisioningSignals.request(vehicle.id);
    }
  }

  private isNewTelemetry(
    vehicle: Vehicle,
    receivedAt: Date,
    uplinkCounter: number | null,
  ): boolean {
    if (uplinkCounter !== null) {
      return uplinkCounter !== vehicle.lastUplinkCounter;
    }
    return vehicle.lastSeen?.getTime() !== receivedAt.getTime();
  }

  private mapTelemetry(
    vehicleId: string,
    device: BridgeDevice,
    receivedAt: Date,
  ): Prisma.TelemetryUncheckedCreateInput {
    const state = device.state;
    return {
      vehicleId,
      receivedAt,
      uplinkCounter: integerOrNull(state.uplink_counter),
      transmissionIntervalSeconds: integerOrNull(
        state.transmission_interval_seconds,
      ),
      batteryMv: integerOrNull(state.battery_mv),
      batteryPercent: integerOrNull(state.battery_percent),
      rssi: integerOrNull(device.rssi),
      snr: numberOrNull(device.snr),
      movement: stringOrNull(state.movement_name),
      speedPercent: integerOrNull(state.speed_percent),
      frontDistanceCm: integerOrNull(state.front_distance_cm),
      rearDistanceCm: integerOrNull(state.rear_distance_cm),
      pitchDegrees: numberOrNull(state.pitch_degrees),
      rollDegrees: numberOrNull(state.roll_degrees),
      temperatureC: numberOrNull(state.temperature_c),
      latitude: numberOrNull(state.latitude),
      longitude: numberOrNull(state.longitude),
      gpsAvailable: booleanOrFalse(state.gps_available),
      ambientTemperatureC: numberOrNull(state.ambient_temperature_c),
      ambientHumidityPercent: numberOrNull(state.ambient_humidity_percent),
      dhtAvailable: booleanOrFalse(state.dht_available),
      localPanicActive: booleanOrFalse(state.local_panic_active),
      remoteAlertActive: booleanOrFalse(state.remote_alert_active),
      rawState: state as Prisma.InputJsonValue,
    };
  }

  private async updateVehicleIfChanged(
    vehicle: Vehicle,
    data: Prisma.VehicleUpdateInput,
  ): Promise<Vehicle> {
    if (!vehicleChanged(vehicle, data)) {
      return vehicle;
    }
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data,
    });
    this.realtime.emitVehicleUpdated(updated);
    return updated;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function integerOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

function vehicleChanged(
  vehicle: Vehicle,
  data: Prisma.VehicleUpdateInput,
): boolean {
  if (typeof data.status === 'string' && data.status !== vehicle.status) {
    return true;
  }
  if (typeof data.devEui === 'string' && data.devEui !== vehicle.devEui) {
    return true;
  }
  if (
    typeof data.lastUplinkCounter === 'number' &&
    data.lastUplinkCounter !== vehicle.lastUplinkCounter
  ) {
    return true;
  }
  return (
    data.lastSeen instanceof Date &&
    data.lastSeen.getTime() !== vehicle.lastSeen?.getTime()
  );
}
