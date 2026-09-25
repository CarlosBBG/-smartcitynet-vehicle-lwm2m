import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import type { Vehicle } from '../types/vehicle';
import { cacheVehicleUpdate } from './use-realtime-sync';
import { vehicleKeys } from './use-vehicles';

const vehicle: Vehicle = {
  id: 'vehicle-1',
  name: 'Vehículo de prueba',
  deviceId: 'heltec-prueba',
  devEui: null,
  lwm2mEndpoint: 'smartcitynet-heltec-prueba',
  model: 'Heltec',
  description: null,
  enabled: true,
  status: 'OFFLINE',
  lastSeen: '2026-09-23T10:00:00Z',
  lastUplinkCounter: 1,
  createdAt: '2026-09-23T09:00:00Z',
  updatedAt: '2026-09-23T10:00:00Z',
  deletedAt: null,
};

describe('cacheVehicleUpdate', () => {
  it('actualiza la lista y el detalle cuando llega un nuevo estado por Socket.IO', () => {
    const client = new QueryClient();
    client.setQueryData(vehicleKeys.all, [vehicle]);
    client.setQueryData(vehicleKeys.detail(vehicle.id), vehicle);
    const updated = { ...vehicle, status: 'ONLINE' as const, lastSeen: '2026-09-23T10:00:05Z' };

    cacheVehicleUpdate(client, updated);

    expect(client.getQueryData(vehicleKeys.detail(vehicle.id))).toEqual(updated);
    expect(client.getQueryData(vehicleKeys.all)).toEqual([updated]);
  });
});
