import { useQuery } from '@tanstack/react-query';

import {
  getLatestTelemetry,
  getLwm2mClients,
  getLwm2mDetails,
  getOperations,
  getTelemetry,
  getVehicle,
  getVehicles,
  type TelemetryQuery,
} from '../services/vehicles.service';
import type { Vehicle } from '../types/vehicle';

const LIVE_REFRESH_MS = 5_000;

export const vehicleKeys = {
  all: ['vehicles'] as const,
  detail: (id: string) => ['vehicles', id] as const,
  latest: (id: string) => ['vehicles', id, 'telemetry', 'latest'] as const,
  telemetry: (id: string, query: TelemetryQuery) =>
    ['vehicles', id, 'telemetry', query] as const,
  operations: (id: string) => ['vehicles', id, 'operations'] as const,
  lwm2mDetail: (id: string) => ['vehicles', id, 'lwm2m'] as const,
  lwm2m: ['lwm2m', 'clients'] as const,
};

export function useVehicles() {
  return useQuery({
    queryKey: vehicleKeys.all,
    queryFn: getVehicles,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useVehicle(vehicleId: string) {
  return useQuery({
    queryKey: vehicleKeys.detail(vehicleId),
    queryFn: () => getVehicle(vehicleId),
    enabled: Boolean(vehicleId),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useLatestTelemetry(vehicleId: string) {
  return useQuery({
    queryKey: vehicleKeys.latest(vehicleId),
    queryFn: () => getLatestTelemetry(vehicleId),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useTelemetryHistory(
  vehicleId: string,
  query: TelemetryQuery,
) {
  return useQuery({
    queryKey: vehicleKeys.telemetry(vehicleId, query),
    queryFn: () => getTelemetry(vehicleId, query),
    enabled: Boolean(vehicleId),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useOperations(vehicleId: string) {
  return useQuery({
    queryKey: vehicleKeys.operations(vehicleId),
    queryFn: () => getOperations(vehicleId),
    enabled: Boolean(vehicleId),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useLwm2mDetails(vehicleId: string) {
  return useQuery({
    queryKey: vehicleKeys.lwm2mDetail(vehicleId),
    queryFn: () => getLwm2mDetails(vehicleId),
    enabled: Boolean(vehicleId),
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useLwm2mClients() {
  return useQuery({
    queryKey: vehicleKeys.lwm2m,
    queryFn: getLwm2mClients,
    refetchInterval: LIVE_REFRESH_MS,
  });
}

export function useFleetTelemetry(vehicles: Vehicle[]) {
  return useQuery({
    queryKey: ['fleet', 'latest-telemetry', vehicles.map(({ id }) => id)],
    queryFn: async () => {
      const entries = await Promise.all(
        vehicles.map(async ({ id }) => [id, await getLatestTelemetry(id)] as const),
      );
      return Object.fromEntries(entries);
    },
    enabled: vehicles.length > 0,
    refetchInterval: LIVE_REFRESH_MS,
  });
}
