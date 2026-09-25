import { VehicleStatus, type Vehicle } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProvisioningSignalService } from '../provisioning/provisioning-signal.service.js';
import { VehiclesService } from './vehicles.service.js';

const vehicle: Vehicle = {
  id: 'db0797bd-fd91-453e-a8b0-31c4a018570e',
  name: 'Vehículo Norte',
  deviceId: 'heltec-norte-01',
  devEui: '70B3D57ED0061234',
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

describe('VehiclesService', () => {
  it('genera un endpoint LwM2M estable a partir de deviceId', async () => {
    const create = vi
      .fn()
      .mockImplementation(({ data }) => ({ ...vehicle, ...data }));
    const prisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(null),
        create,
      },
    } as unknown as PrismaService;
    const request = vi.fn();
    const service = new VehiclesService(prisma, {
      request,
    } as unknown as ProvisioningSignalService);

    const result = await service.create({
      name: vehicle.name,
      deviceId: vehicle.deviceId,
      devEui: vehicle.devEui ?? undefined,
      model: vehicle.model,
    });

    expect(result.lwm2mEndpoint).toBe('smartcitynet-heltec-norte-01');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deviceId: vehicle.deviceId,
        lwm2mEndpoint: vehicle.lwm2mEndpoint,
      }),
    });
    expect(request).toHaveBeenCalledWith(vehicle.id);
  });

  it('realiza borrado lógico sin eliminar históricos', async () => {
    const update = vi
      .fn()
      .mockImplementation(({ data }) => ({ ...vehicle, ...data }));
    const prisma = {
      vehicle: {
        findFirst: vi.fn().mockResolvedValue(vehicle),
        update,
      },
    } as unknown as PrismaService;
    const request = vi.fn();
    const service = new VehiclesService(prisma, {
      request,
    } as unknown as ProvisioningSignalService);

    const result = await service.remove(vehicle.id);

    expect(result.enabled).toBe(false);
    expect(result.status).toBe(VehicleStatus.DISABLED);
    expect(result.deletedAt).toBeInstanceOf(Date);
    expect(update).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(vehicle.id);
  });
});
