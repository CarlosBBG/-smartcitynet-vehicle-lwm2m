import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Vehicle, VehicleStatus } from '@prisma/client';
import type { Subscription } from 'rxjs';

import { AlertsService } from '../alerts/alerts.service.js';
import { BridgeService } from '../bridge/bridge.service.js';
import type { BridgeDevice } from '../bridge/bridge.types.js';
import { LeshanService } from '../leshan/leshan.service.js';
import type { LeshanClientRegistration } from '../leshan/leshan.types.js';
import { Lwm2mManagerService } from '../lwm2m-manager/lwm2m-manager.service.js';
import type { Lwm2mManagerClient } from '../lwm2m-manager/lwm2m-manager.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProvisioningSignalService } from '../provisioning/provisioning-signal.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

interface RetryState {
  failures: number;
  nextAttemptAt: number;
}

@Injectable()
export class VehicleProvisioningService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(VehicleProvisioningService.name);
  private readonly intervalMs: number;
  private readonly registrationGraceMs: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly offlineThresholdMs: number;
  private readonly retries = new Map<string, RetryState>();
  private readonly unregisteredSince = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  private subscription?: Subscription;
  private running = false;
  private rerunRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeService,
    private readonly manager: Lwm2mManagerService,
    private readonly leshan: LeshanService,
    private readonly realtime: RealtimeGateway,
    private readonly signals: ProvisioningSignalService,
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
  ) {
    this.intervalMs = config.get<number>('LWM2M_RECONCILE_INTERVAL_MS', 5000);
    this.registrationGraceMs = config.get<number>(
      'LWM2M_REGISTRATION_GRACE_MS',
      15_000,
    );
    this.retryBaseMs = config.get<number>('LWM2M_RETRY_BASE_MS', 5000);
    this.retryMaxMs = config.get<number>('LWM2M_RETRY_MAX_MS', 60_000);
    this.offlineThresholdMs =
      config.get<number>('OFFLINE_THRESHOLD_SECONDS', 120) * 1000;
  }

  onModuleInit(): void {
    this.subscription = this.signals.subscribe(() => this.requestReconcile());
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.requestReconcile();
    this.timer = setInterval(() => this.requestReconcile(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  requestReconcile(): void {
    if (this.running) {
      this.rerunRequested = true;
      return;
    }
    void this.reconcile();
  }

  async reconcile(): Promise<void> {
    if (this.running) {
      this.rerunRequested = true;
      return;
    }
    this.running = true;
    try {
      await this.performReconciliation();
    } catch (error) {
      this.logger.error(`Falló la reconciliación: ${messageOf(error)}`);
    } finally {
      this.running = false;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        queueMicrotask(() => this.requestReconcile());
      }
    }
  }

  private async performReconciliation(): Promise<void> {
    const vehicles = await this.prisma.vehicle.findMany();
    let devices: BridgeDevice[];
    try {
      devices = await this.bridge.getDevices();
    } catch (error) {
      this.logger.warn(
        `No se puede reconciliar sin Bridge: ${messageOf(error)}`,
      );
      return;
    }

    let managerClients: Lwm2mManagerClient[];
    try {
      managerClients = await this.manager.getClients();
    } catch (error) {
      this.logger.warn(`Manager LwM2M no disponible: ${messageOf(error)}`);
      const knownDevices = new Set(devices.map((device) => device.device_id));
      for (const vehicle of vehicles) {
        if (
          vehicle.enabled &&
          !vehicle.deletedAt &&
          knownDevices.has(vehicle.deviceId)
        ) {
          this.recordFailure(vehicle.id);
          await this.updateStatus(
            vehicle,
            this.statusFor(vehicle.lastSeen, false),
          );
        }
      }
      return;
    }

    let leshanClients: LeshanClientRegistration[] = [];
    let leshanAvailable = true;
    try {
      leshanClients = await this.leshan.getClients();
    } catch (error) {
      leshanAvailable = false;
      this.logger.warn(`Leshan no disponible: ${messageOf(error)}`);
    }

    const devicesById = new Map(
      devices.map((device) => [device.device_id, device]),
    );
    const managerByEndpoint = new Map(
      managerClients.map((client) => [client.endpoint, client]),
    );
    const leshanEndpoints = new Set(
      leshanClients.map((client) => client.endpoint),
    );

    for (const vehicle of vehicles) {
      try {
        await this.reconcileVehicle(
          vehicle,
          devicesById.has(vehicle.deviceId),
          managerByEndpoint.get(vehicle.lwm2mEndpoint),
          leshanAvailable,
          leshanEndpoints.has(vehicle.lwm2mEndpoint),
        );
      } catch (error) {
        this.recordFailure(vehicle.id);
        this.logger.warn(
          `Aprovisionamiento de ${vehicle.deviceId} pendiente: ${messageOf(error)}`,
        );
        await this.updateStatus(
          vehicle,
          this.statusFor(vehicle.lastSeen, false),
        );
      }
    }

    const knownEndpoints = new Set(
      vehicles.map((vehicle) => vehicle.lwm2mEndpoint),
    );
    for (const client of managerClients) {
      if (!knownEndpoints.has(client.endpoint)) {
        await this.stopSafely(client.endpoint);
      }
    }
  }

  private async reconcileVehicle(
    vehicle: Vehicle,
    bridgeKnowsDevice: boolean,
    managerClient: Lwm2mManagerClient | undefined,
    leshanAvailable: boolean,
    leshanRegistered: boolean,
  ): Promise<void> {
    const shouldRun =
      vehicle.enabled && !vehicle.deletedAt && bridgeKnowsDevice;
    if (!shouldRun) {
      if (managerClient) {
        await this.stopSafely(vehicle.lwm2mEndpoint);
      }
      this.clearRetry(vehicle.id);
      await this.updateStatus(
        vehicle,
        vehicle.enabled && !vehicle.deletedAt
          ? VehicleStatus.PENDING_DISCOVERY
          : VehicleStatus.DISABLED,
      );
      return;
    }

    if (!managerClient) {
      if (!this.canAttempt(vehicle.id)) {
        await this.updateStatus(
          vehicle,
          this.statusFor(vehicle.lastSeen, false),
        );
        return;
      }
      const started = await this.manager.startClient(
        vehicle.deviceId,
        vehicle.lwm2mEndpoint,
      );
      managerClient = started;
      leshanRegistered =
        started.registered &&
        leshanAvailable &&
        (await this.leshan.getClient(vehicle.lwm2mEndpoint)) !== null;
    }

    const fullyRegistered =
      managerClient.state === 'RUNNING' &&
      managerClient.registered &&
      leshanAvailable &&
      leshanRegistered;
    if (fullyRegistered) {
      this.clearRetry(vehicle.id);
      this.unregisteredSince.delete(vehicle.id);
      await this.updateStatus(vehicle, this.statusFor(vehicle.lastSeen, true));
      return;
    }

    await this.updateStatus(vehicle, this.statusFor(vehicle.lastSeen, false));
    const missingSince = this.unregisteredSince.get(vehicle.id) ?? Date.now();
    this.unregisteredSince.set(vehicle.id, missingSince);
    if (
      leshanAvailable &&
      Date.now() - missingSince >= this.registrationGraceMs &&
      this.canAttempt(vehicle.id)
    ) {
      await this.stopSafely(vehicle.lwm2mEndpoint);
      const restarted = await this.manager.startClient(
        vehicle.deviceId,
        vehicle.lwm2mEndpoint,
      );
      const registration = restarted.registered
        ? await this.leshan.getClient(vehicle.lwm2mEndpoint)
        : null;
      if (!registration) {
        throw new Error('Leshan no confirmó el registro después del reinicio');
      }
      this.clearRetry(vehicle.id);
      this.unregisteredSince.delete(vehicle.id);
      await this.updateStatus(vehicle, this.statusFor(vehicle.lastSeen, true));
    }
  }

  private statusFor(lastSeen: Date | null, registered: boolean): VehicleStatus {
    if (lastSeen && Date.now() - lastSeen.getTime() > this.offlineThresholdMs) {
      return VehicleStatus.OFFLINE;
    }
    return registered ? VehicleStatus.ONLINE : VehicleStatus.LWM2M_DISCONNECTED;
  }

  private async updateStatus(
    vehicle: Vehicle,
    status: VehicleStatus,
  ): Promise<void> {
    if (vehicle.status === status) {
      await this.alerts.evaluateVehicle(vehicle);
      return;
    }
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { status },
    });
    this.realtime.emitVehicleUpdated(updated);
    this.realtime.emitLwm2mStatus(updated);
    await this.alerts.evaluateVehicle(updated);
  }

  private async stopSafely(endpoint: string): Promise<void> {
    try {
      await this.manager.stopClient(endpoint);
    } catch (error) {
      if (!hasApiCode(error, 'LWM2M_CLIENT_NOT_FOUND')) {
        throw error;
      }
    }
  }

  private canAttempt(vehicleId: string): boolean {
    return Date.now() >= (this.retries.get(vehicleId)?.nextAttemptAt ?? 0);
  }

  private recordFailure(vehicleId: string): void {
    const failures = (this.retries.get(vehicleId)?.failures ?? 0) + 1;
    const delay = Math.min(
      this.retryBaseMs * 2 ** Math.max(0, failures - 1),
      this.retryMaxMs,
    );
    this.retries.set(vehicleId, {
      failures,
      nextAttemptAt: Date.now() + delay,
    });
  }

  private clearRetry(vehicleId: string): void {
    this.retries.delete(vehicleId);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasApiCode(error: unknown, expected: string): boolean {
  if (!(error instanceof Error) || !('getResponse' in error)) {
    return false;
  }
  const response = (error as { getResponse(): unknown }).getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === expected
  );
}
