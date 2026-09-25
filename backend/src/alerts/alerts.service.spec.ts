import type { ConfigService } from '@nestjs/config';
import {
  AlertSeverity,
  AlertType,
  type Alert,
  type Telemetry,
  type Vehicle,
  VehicleStatus,
} from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service.js';
import type { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { AlertsService } from './alerts.service.js';

const vehicle = {
  id: 'db0797bd-fd91-453e-a8b0-31c4a018570e',
  name: 'Vehículo Norte',
  deviceId: 'heltec-norte-01',
  devEui: null,
  lwm2mEndpoint: 'smartcitynet-heltec-norte-01',
  model: 'Heltec WiFi LoRa 32 V3',
  description: null,
  enabled: true,
  status: VehicleStatus.ONLINE,
  lastSeen: new Date(),
  lastUplinkCounter: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
} satisfies Vehicle;

const telemetry = {
  id: '18e164cf-37e2-4553-ae10-65d42bf55cd3',
  vehicleId: vehicle.id,
  localPanicActive: true,
  batteryPercent: 75,
  receivedAt: new Date(),
} as Telemetry;

const config = {
  get: vi.fn().mockImplementation((_key: string, fallback: number) => fallback),
} as unknown as ConfigService;

describe('AlertsService', () => {
  it('crea una única alerta activa para pánico local repetido', async () => {
    const active = new Map<AlertType, Alert>();
    const create = vi.fn().mockImplementation(async ({ data }) => {
      const alert = {
        id: `alert-${String(data.type)}`,
        ...data,
        active: true,
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
        createdAt: new Date(),
        resolvedAt: null,
      } as Alert;
      active.set(alert.type, alert);
      return alert;
    });
    const realtime = { emitAlertCreated: vi.fn(), emitAlertUpdated: vi.fn() };
    const service = new AlertsService(
      {
        alert: {
          findFirst: vi.fn().mockImplementation(({ where }) => active.get(where.type) ?? null),
          create,
          update: vi.fn(),
        },
      } as unknown as PrismaService,
      realtime as unknown as RealtimeGateway,
      config,
    );

    await service.evaluateVehicle(vehicle, telemetry);
    await service.evaluateVehicle(vehicle, telemetry);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: AlertType.LOCAL_PANIC,
        severity: AlertSeverity.CRITICAL,
        vehicleId: vehicle.id,
        ruleKey: `${vehicle.id}:${AlertType.LOCAL_PANIC}`,
      }),
    });
    expect(realtime.emitAlertCreated).toHaveBeenCalledTimes(1);
  });

  it('resuelve la alerta offline cuando el vehículo vuelve a estar online', async () => {
    const current = {
      id: 'alert-offline',
      vehicleId: vehicle.id,
      type: AlertType.VEHICLE_OFFLINE,
      active: true,
    } as Alert;
    const resolved = { ...current, active: false, resolvedAt: new Date() };
    const update = vi.fn().mockResolvedValue(resolved);
    const realtime = { emitAlertCreated: vi.fn(), emitAlertUpdated: vi.fn() };
    const service = new AlertsService(
      {
        alert: {
          findFirst: vi.fn().mockImplementation(({ where }) =>
            where.type === AlertType.VEHICLE_OFFLINE ? current : null,
          ),
          create: vi.fn(),
          update,
        },
      } as unknown as PrismaService,
      realtime as unknown as RealtimeGateway,
      config,
    );

    await service.evaluateVehicle(vehicle);

    expect(update).toHaveBeenCalledWith({
      where: { id: current.id },
      data: { active: false, resolvedAt: expect.any(Date), ruleKey: null },
    });
    expect(realtime.emitAlertUpdated).toHaveBeenCalledWith(resolved);
  });

  it('registra quién reconoció una alerta', async () => {
    const current = {
      id: 'alert-1',
      acknowledged: false,
    } as Alert;
    const updated = { ...current, acknowledged: true };
    const update = vi.fn().mockResolvedValue(updated);
    const realtime = { emitAlertUpdated: vi.fn() };
    const service = new AlertsService(
      {
        alert: { findUnique: vi.fn().mockResolvedValue(current), update },
      } as unknown as PrismaService,
      realtime as unknown as RealtimeGateway,
      config,
    );

    await service.acknowledge(current.id, 'user-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: current.id },
      data: {
        acknowledged: true,
        acknowledgedBy: 'user-1',
        acknowledgedAt: expect.any(Date),
      },
    });
  });
});
