import type { ConfigService } from '@nestjs/config';
import { VehicleStatus, type Vehicle } from '@prisma/client';

import type { AlertsService } from '../alerts/alerts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProvisioningSignalService } from '../provisioning/provisioning-signal.service.js';
import type { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { BridgeDevice } from './bridge.types.js';
import { BridgeSyncService } from './bridge-sync.service.js';
import type { BridgeService } from './bridge.service.js';

const receivedAt = new Date();
const vehicle: Vehicle = {
  id: 'db0797bd-fd91-453e-a8b0-31c4a018570e',
  name: 'Vehículo Norte',
  deviceId: 'heltec-norte-01',
  devEui: null,
  lwm2mEndpoint: 'smartcitynet-heltec-norte-01',
  model: 'Heltec WiFi LoRa 32 V3',
  description: null,
  enabled: true,
  status: VehicleStatus.PENDING_DISCOVERY,
  lastSeen: null,
  lastUplinkCounter: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};
const device: BridgeDevice = {
  device_id: vehicle.deviceId,
  endpoint: vehicle.lwm2mEndpoint,
  dev_eui: '70B3D57ED0061234',
  last_seen: receivedAt.toISOString(),
  rssi: -97,
  snr: 7.5,
  state: {
    uplink_counter: 42,
    transmission_interval_seconds: 30,
    battery_mv: 11_820,
    battery_percent: 73,
    movement_name: 'stopped',
    speed_percent: 0,
    ambient_temperature_c: 22.4,
    ambient_humidity_percent: 51.5,
    dht_available: true,
  },
};

describe('BridgeSyncService', () => {
  it('guarda una telemetría nueva y no duplica el mismo uplink', async () => {
    const synchronizedVehicle = {
      ...vehicle,
      devEui: device.dev_eui,
      status: VehicleStatus.LWM2M_DISCONNECTED,
      lastSeen: receivedAt,
      lastUplinkCounter: 42,
    };
    const telemetry = {
      id: '7c9ce075-b239-4114-90d1-9971e5f52cae',
      vehicleId: vehicle.id,
    };
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([vehicle])
      .mockResolvedValueOnce([synchronizedVehicle]);
    const create = vi.fn().mockResolvedValue(telemetry);
    const update = vi.fn().mockResolvedValue(synchronizedVehicle);
    const prisma = {
      vehicle: { findMany, update },
      telemetry: { create },
      $transaction: vi
        .fn()
        .mockImplementation((operations: Promise<unknown>[]) =>
          Promise.all(operations),
        ),
    } as unknown as PrismaService;
    const bridge = {
      getDevices: vi.fn().mockResolvedValue([device]),
    } as unknown as BridgeService;
    const emitTelemetryReceived = vi.fn();
    const emitVehicleUpdated = vi.fn();
    const realtime = {
      emitTelemetryReceived,
      emitVehicleUpdated,
    } as unknown as RealtimeGateway;
    const requestProvisioning = vi.fn();
    const provisioningSignals = {
      request: requestProvisioning,
    } as unknown as ProvisioningSignalService;
    const config = {
      get: vi.fn().mockImplementation((key: string, fallback: number) => {
        if (key === 'BRIDGE_SYNC_INTERVAL_MS') return 2000;
        if (key === 'OFFLINE_THRESHOLD_SECONDS') return 120;
        return fallback;
      }),
    } as unknown as ConfigService;
    const service = new BridgeSyncService(
      bridge,
      prisma,
      realtime,
      provisioningSignals,
      { evaluateVehicle: vi.fn() } as unknown as AlertsService,
      config,
    );

    await service.syncOnce();
    await service.syncOnce();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vehicleId: vehicle.id,
        uplinkCounter: 42,
        batteryPercent: 73,
        ambientTemperatureC: 22.4,
        dhtAvailable: true,
        rssi: -97,
        snr: 7.5,
      }),
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: vehicle.id },
      data: expect.objectContaining({
        status: VehicleStatus.LWM2M_DISCONNECTED,
        lastUplinkCounter: 42,
      }),
    });
    expect(emitTelemetryReceived).toHaveBeenCalledTimes(1);
    expect(emitVehicleUpdated).toHaveBeenCalledTimes(1);
    expect(requestProvisioning).toHaveBeenCalledWith(vehicle.id);
  });
});
