import { ConflictException, NotFoundException } from '@nestjs/common';

import type { LeshanService } from '../leshan/leshan.service.js';
import type { OperationsService } from '../operations/operations.service.js';
import type { VehiclesService } from '../vehicles/vehicles.service.js';
import { Lwm2mService } from './lwm2m.service.js';

const vehicle = {
  id: 'vehicle-1',
  enabled: true,
  lwm2mEndpoint: 'smartcitynet-heltec-labredes',
};

describe('Lwm2mService', () => {
  it('traduce el control frontal al recurso fijo /32769/0/23', async () => {
    const writeBooleanResource = vi.fn().mockResolvedValue({ success: true });
    const leshan = {
      getClient: vi.fn().mockResolvedValue({ endpoint: vehicle.lwm2mEndpoint }),
      writeBooleanResource,
    } as unknown as LeshanService;
    const operations = {
      syncOnce: vi.fn().mockResolvedValue(undefined),
      findPending: vi.fn().mockResolvedValue(null),
      findLatest: vi.fn().mockResolvedValue(null),
    } as unknown as OperationsService;
    const service = new Lwm2mService(
      { findOne: vi.fn().mockResolvedValue(vehicle) } as unknown as VehiclesService,
      leshan,
      operations,
    );

    await service.setLight(vehicle.id, 'front', true);

    expect(writeBooleanResource).toHaveBeenCalledWith(
      vehicle.lwm2mEndpoint,
      32_769,
      0,
      23,
      true,
    );
  });

  it('rechaza nombres de luz que no pertenecen al contrato', async () => {
    const service = new Lwm2mService(
      {} as VehiclesService,
      {} as LeshanService,
      {} as OperationsService,
    );

    await expect(
      service.setLight(vehicle.id, '../../../3/0/4', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloquea un segundo comando mientras existe una operación pendiente', async () => {
    const service = new Lwm2mService(
      { findOne: vi.fn().mockResolvedValue(vehicle) } as unknown as VehiclesService,
      { getClient: vi.fn().mockResolvedValue({ endpoint: vehicle.lwm2mEndpoint }) } as unknown as LeshanService,
      {
        syncOnce: vi.fn().mockResolvedValue(undefined),
        findPending: vi.fn().mockResolvedValue({ status: 'ttn_queued' }),
      } as unknown as OperationsService,
    );

    await expect(
      service.setRemoteAlert(vehicle.id, true),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('una operación pendiente de un vehículo no bloquea otro', async () => {
    const vehicleB = {
      id: 'vehicle-2',
      enabled: true,
      lwm2mEndpoint: 'smartcitynet-heltec-vehiculo-b',
    };
    const writeBooleanResource = vi.fn().mockResolvedValue({ success: true });
    const operations = {
      syncOnce: vi.fn().mockResolvedValue(undefined),
      findPending: vi.fn().mockImplementation((vehicleId: string) =>
        Promise.resolve(vehicleId === vehicle.id ? { status: 'ttn_queued' } : null),
      ),
      findLatest: vi.fn().mockResolvedValue(null),
    } as unknown as OperationsService;
    const service = new Lwm2mService(
      {
        findOne: vi.fn().mockImplementation((vehicleId: string) =>
          Promise.resolve(vehicleId === vehicle.id ? vehicle : vehicleB),
        ),
      } as unknown as VehiclesService,
      {
        getClient: vi.fn().mockImplementation((endpoint: string) =>
          Promise.resolve({ endpoint }),
        ),
        writeBooleanResource,
      } as unknown as LeshanService,
      operations,
    );

    await expect(service.setRemoteAlert(vehicle.id, true)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.setLight(vehicleB.id, 'front', true)).resolves.toMatchObject({
      accepted: true,
    });
    expect(writeBooleanResource).toHaveBeenCalledWith(
      vehicleB.lwm2mEndpoint,
      32_769,
      0,
      23,
      true,
    );
  });
});
