import type { ConfigService } from '@nestjs/config';
import { VehicleStatus, type Vehicle } from '@prisma/client';

import type { AlertsService } from '../alerts/alerts.service.js';
import type { BridgeService } from '../bridge/bridge.service.js';
import type { LeshanService } from '../leshan/leshan.service.js';
import type { Lwm2mManagerService } from '../lwm2m-manager/lwm2m-manager.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProvisioningSignalService } from '../provisioning/provisioning-signal.service.js';
import type { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { VehicleProvisioningService } from './vehicle-provisioning.service.js';

const vehicle: Vehicle = {
  id: 'db0797bd-fd91-453e-a8b0-31c4a018570e',
  name: 'Vehículo Norte',
  deviceId: 'heltec-norte-01',
  devEui: '70B3D57ED0061234',
  lwm2mEndpoint: 'smartcitynet-heltec-norte-01',
  model: 'Heltec WiFi LoRa 32 V3',
  description: null,
  enabled: true,
  status: VehicleStatus.LWM2M_DISCONNECTED,
  lastSeen: new Date(),
  lastUplinkCounter: 10,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const config = {
  get: vi.fn().mockImplementation((key: string, fallback: number | string) => {
    const values: Record<string, number | string> = {
      LWM2M_RECONCILE_INTERVAL_MS: 5000,
      LWM2M_REGISTRATION_GRACE_MS: 15_000,
      LWM2M_RETRY_BASE_MS: 5000,
      LWM2M_RETRY_MAX_MS: 60_000,
      OFFLINE_THRESHOLD_SECONDS: 120,
      NODE_ENV: 'test',
    };
    return values[key] ?? fallback;
  }),
} as unknown as ConfigService;

describe('VehicleProvisioningService', () => {
  it('crea automáticamente el cliente descubierto y confirma Leshan', async () => {
    const update = vi.fn().mockImplementation(({ data }) => ({
      ...vehicle,
      ...data,
    }));
    const prisma = {
      vehicle: { findMany: vi.fn().mockResolvedValue([vehicle]), update },
    } as unknown as PrismaService;
    const bridge = {
      getDevices: vi.fn().mockResolvedValue([
        {
          device_id: vehicle.deviceId,
          endpoint: vehicle.lwm2mEndpoint,
          dev_eui: vehicle.devEui,
          last_seen: vehicle.lastSeen?.toISOString(),
          rssi: -90,
          snr: 7,
          state: {},
        },
      ]),
    } as unknown as BridgeService;
    const startClient = vi.fn().mockResolvedValue({
      deviceId: vehicle.deviceId,
      endpoint: vehicle.lwm2mEndpoint,
      state: 'RUNNING',
      registered: true,
      startedAt: new Date().toISOString(),
      lastError: null,
      created: true,
    });
    const manager = {
      getClients: vi.fn().mockResolvedValue([]),
      startClient,
    } as unknown as Lwm2mManagerService;
    const leshan = {
      getClients: vi.fn().mockResolvedValue([]),
      getClient: vi.fn().mockResolvedValue({ endpoint: vehicle.lwm2mEndpoint }),
    } as unknown as LeshanService;
    const emitVehicleUpdated = vi.fn();
    const service = new VehicleProvisioningService(
      prisma,
      bridge,
      manager,
      leshan,
      { emitVehicleUpdated, emitLwm2mStatus: vi.fn() } as unknown as RealtimeGateway,
      { subscribe: vi.fn() } as unknown as ProvisioningSignalService,
      { evaluateVehicle: vi.fn() } as unknown as AlertsService,
      config,
    );

    await service.reconcile();

    expect(startClient).toHaveBeenCalledWith(
      vehicle.deviceId,
      vehicle.lwm2mEndpoint,
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: vehicle.id },
      data: { status: VehicleStatus.ONLINE },
    });
    expect(emitVehicleUpdated).toHaveBeenCalledTimes(1);
  });

  it('aprovisiona dos vehículos descubiertos como clientes independientes', async () => {
    const secondVehicle: Vehicle = {
      ...vehicle,
      id: '863e8020-ab65-4bf3-aebd-8193f0ac1e75',
      name: 'Vehículo Sur',
      deviceId: 'heltec-sur-02',
      devEui: '70B3D57ED0065678',
      lwm2mEndpoint: 'smartcitynet-heltec-sur-02',
    };
    const vehicles = [vehicle, secondVehicle];
    const update = vi.fn().mockImplementation(({ where, data }) => ({
      ...vehicles.find((item) => item.id === where.id),
      ...data,
    }));
    const startClient = vi.fn().mockImplementation(
      (deviceId: string, endpoint: string) =>
        Promise.resolve({
          deviceId,
          endpoint,
          state: 'RUNNING',
          registered: true,
          startedAt: new Date().toISOString(),
          lastError: null,
          created: true,
        }),
    );
    const service = new VehicleProvisioningService(
      {
        vehicle: { findMany: vi.fn().mockResolvedValue(vehicles), update },
      } as unknown as PrismaService,
      {
        getDevices: vi.fn().mockResolvedValue(
          vehicles.map((item) => ({ device_id: item.deviceId })),
        ),
      } as unknown as BridgeService,
      {
        getClients: vi.fn().mockResolvedValue([]),
        startClient,
      } as unknown as Lwm2mManagerService,
      {
        getClients: vi.fn().mockResolvedValue([]),
        getClient: vi.fn().mockImplementation((endpoint: string) =>
          Promise.resolve({ endpoint }),
        ),
      } as unknown as LeshanService,
      {
        emitVehicleUpdated: vi.fn(),
        emitLwm2mStatus: vi.fn(),
      } as unknown as RealtimeGateway,
      { subscribe: vi.fn() } as unknown as ProvisioningSignalService,
      { evaluateVehicle: vi.fn() } as unknown as AlertsService,
      config,
    );

    await service.reconcile();

    expect(startClient).toHaveBeenCalledTimes(2);
    expect(startClient).toHaveBeenCalledWith(
      vehicle.deviceId,
      vehicle.lwm2mEndpoint,
    );
    expect(startClient).toHaveBeenCalledWith(
      secondVehicle.deviceId,
      secondVehicle.lwm2mEndpoint,
    );
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('desaprovisiona un vehículo deshabilitado sin borrar históricos', async () => {
    const disabled = {
      ...vehicle,
      enabled: false,
      status: VehicleStatus.DISABLED,
    };
    const prisma = {
      vehicle: {
        findMany: vi.fn().mockResolvedValue([disabled]),
        update: vi.fn(),
      },
    } as unknown as PrismaService;
    const stopClient = vi.fn().mockResolvedValue({});
    const service = new VehicleProvisioningService(
      prisma,
      { getDevices: vi.fn().mockResolvedValue([]) } as unknown as BridgeService,
      {
        getClients: vi.fn().mockResolvedValue([
          {
            deviceId: disabled.deviceId,
            endpoint: disabled.lwm2mEndpoint,
            state: 'RUNNING',
            registered: true,
          },
        ]),
        stopClient,
      } as unknown as Lwm2mManagerService,
      { getClients: vi.fn().mockResolvedValue([]) } as unknown as LeshanService,
      { emitVehicleUpdated: vi.fn() } as unknown as RealtimeGateway,
      { subscribe: vi.fn() } as unknown as ProvisioningSignalService,
      { evaluateVehicle: vi.fn() } as unknown as AlertsService,
      config,
    );

    await service.reconcile();

    expect(stopClient).toHaveBeenCalledWith(disabled.lwm2mEndpoint);
  });

  it('aplica backoff y evita reintentos inmediatos cuando el manager falla', async () => {
    const startClient = vi.fn().mockRejectedValue(new Error('manager caído'));
    const service = new VehicleProvisioningService(
      {
        vehicle: {
          findMany: vi.fn().mockResolvedValue([vehicle]),
          update: vi.fn(),
        },
      } as unknown as PrismaService,
      {
        getDevices: vi
          .fn()
          .mockResolvedValue([{ device_id: vehicle.deviceId }]),
      } as unknown as BridgeService,
      {
        getClients: vi.fn().mockResolvedValue([]),
        startClient,
      } as unknown as Lwm2mManagerService,
      { getClients: vi.fn().mockResolvedValue([]) } as unknown as LeshanService,
      { emitVehicleUpdated: vi.fn() } as unknown as RealtimeGateway,
      { subscribe: vi.fn() } as unknown as ProvisioningSignalService,
      { evaluateVehicle: vi.fn() } as unknown as AlertsService,
      config,
    );

    await service.reconcile();
    await service.reconcile();

    expect(startClient).toHaveBeenCalledTimes(1);
  });
});
