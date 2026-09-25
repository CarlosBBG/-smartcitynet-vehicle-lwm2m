import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';

import { useAuth } from '../context/AuthContext';
import { defaultBackendOrigin } from '../services/backend-origin';
import type { VehicleAlert } from '../types/alert';
import type { Operation, Telemetry, Vehicle } from '../types/vehicle';
import { alertKeys } from './use-alerts';
import { vehicleKeys } from './use-vehicles';

export function cacheVehicleUpdate(queryClient: QueryClient, vehicle: Vehicle): void {
  queryClient.setQueryData(vehicleKeys.detail(vehicle.id), vehicle);
  queryClient.setQueryData<Vehicle[]>(vehicleKeys.all, (current) =>
    current?.map((item) => (item.id === vehicle.id ? vehicle : item)),
  );
}

export function useRealtimeSync(onAlertCreated?: (alert: VehicleAlert) => void): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) return undefined;
    const socket = io(
      `${import.meta.env.VITE_SOCKET_URL ?? defaultBackendOrigin()}/realtime`,
      { auth: { token: session.accessToken }, transports: ['websocket'] },
    );

    const updateVehicle = (vehicle: Vehicle) => cacheVehicleUpdate(queryClient, vehicle);
    const updateTelemetry = (
      event: Telemetry | { vehicleId: string; telemetry: Telemetry },
    ) => {
      const telemetry = 'telemetry' in event ? event.telemetry : event;
      queryClient.setQueryData(vehicleKeys.latest(telemetry.vehicleId), telemetry);
      void queryClient.invalidateQueries({ queryKey: ['fleet', 'latest-telemetry'] });
      void queryClient.invalidateQueries({
        queryKey: ['vehicles', telemetry.vehicleId, 'telemetry'],
      });
    };
    const updateAlert = (_alert: VehicleAlert) => {
      void queryClient.invalidateQueries({ queryKey: alertKeys.all });
    };
    const createAlert = (alert: VehicleAlert) => {
      updateAlert(alert);
      onAlertCreated?.(alert);
    };
    const updateLwm2mStatus = (event: { vehicleId: string }) => {
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.detail(event.vehicleId),
      });
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.lwm2mDetail(event.vehicleId),
      });
      void queryClient.invalidateQueries({ queryKey: vehicleKeys.lwm2m });
    };
    const updateOperation = (operation: Operation) => {
      queryClient.setQueryData<Operation[]>(
        vehicleKeys.operations(operation.vehicleId),
        (current) => {
          if (!current) return [operation];
          const exists = current.some((item) => item.id === operation.id);
          return exists
            ? current.map((item) => (item.id === operation.id ? operation : item))
            : [operation, ...current];
        },
      );
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.lwm2mDetail(operation.vehicleId),
      });
    };

    socket.on('vehicle.updated', updateVehicle);
    socket.on('telemetry.received', updateTelemetry);
    socket.on('operation.updated', updateOperation);
    socket.on('alert.created', createAlert);
    socket.on('alert.updated', updateAlert);
    socket.on('lwm2m.status', updateLwm2mStatus);
    return () => {
      socket.off('vehicle.updated', updateVehicle);
      socket.off('telemetry.received', updateTelemetry);
      socket.off('operation.updated', updateOperation);
      socket.off('alert.created', createAlert);
      socket.off('alert.updated', updateAlert);
      socket.off('lwm2m.status', updateLwm2mStatus);
      socket.disconnect();
    };
  }, [onAlertCreated, queryClient, session]);
}
