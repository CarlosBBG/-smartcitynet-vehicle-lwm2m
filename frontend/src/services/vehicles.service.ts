import axios from 'axios';

import type {
  Lwm2mClientsResponse,
  Lwm2mDetails,
  Lwm2mResource,
  Lwm2mWriteResponse,
  Operation,
  Telemetry,
  TelemetryPage,
  Vehicle,
  VehicleInput,
} from '../types/vehicle';
import { api } from './api';

export async function getVehicles(): Promise<Vehicle[]> {
  const { data } = await api.get<Vehicle[]>('/vehicles');
  return data;
}

export async function getVehicle(id: string): Promise<Vehicle> {
  const { data } = await api.get<Vehicle>(`/vehicles/${id}`);
  return data;
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const { data } = await api.post<Vehicle>('/vehicles', input);
  return data;
}

export async function updateVehicle(
  id: string,
  input: Partial<Omit<VehicleInput, 'deviceId'>>,
): Promise<Vehicle> {
  const { data } = await api.patch<Vehicle>(`/vehicles/${id}`, input);
  return data;
}

export async function getLatestTelemetry(
  vehicleId: string,
): Promise<Telemetry | null> {
  try {
    const { data } = await api.get<Telemetry>(
      `/vehicles/${vehicleId}/telemetry/latest`,
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export interface TelemetryQuery {
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
}

export async function getTelemetry(
  vehicleId: string,
  query: TelemetryQuery,
): Promise<TelemetryPage> {
  const { data } = await api.get<TelemetryPage>(
    `/vehicles/${vehicleId}/telemetry`,
    { params: query },
  );
  return data;
}

export async function getOperations(vehicleId: string): Promise<Operation[]> {
  const { data } = await api.get<Operation[]>(
    `/vehicles/${vehicleId}/operations`,
  );
  return data;
}

export async function getLwm2mDetails(
  vehicleId: string,
): Promise<Lwm2mDetails> {
  const { data } = await api.get<Lwm2mDetails>(
    `/vehicles/${vehicleId}/lwm2m`,
  );
  return data;
}

export async function getLwm2mResources(
  vehicleId: string,
): Promise<Lwm2mResource[]> {
  const { data } = await api.get<Lwm2mResource[]>(
    `/vehicles/${vehicleId}/lwm2m/resources`,
  );
  return data;
}

export async function setTransmissionInterval(
  vehicleId: string,
  value: number,
): Promise<Lwm2mWriteResponse> {
  const { data } = await api.put<Lwm2mWriteResponse>(
    `/vehicles/${vehicleId}/lwm2m/transmission-interval`,
    { value },
  );
  return data;
}

export async function setRemoteAlert(
  vehicleId: string,
  value: boolean,
): Promise<Lwm2mWriteResponse> {
  const { data } = await api.put<Lwm2mWriteResponse>(
    `/vehicles/${vehicleId}/lwm2m/remote-alert`,
    { value },
  );
  return data;
}

export type LightName = 'front' | 'rear' | 'parking' | 'left' | 'right';

export async function setLight(
  vehicleId: string,
  light: LightName,
  value: boolean,
): Promise<Lwm2mWriteResponse> {
  const { data } = await api.put<Lwm2mWriteResponse>(
    `/vehicles/${vehicleId}/lwm2m/lights/${light}`,
    { value },
  );
  return data;
}

export async function getLwm2mClients(): Promise<Lwm2mClientsResponse> {
  const { data } = await api.get<Lwm2mClientsResponse>('/lwm2m/clients');
  return data;
}
