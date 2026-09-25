import type {
  AlertsPageResponse,
  AlertsQuery,
  VehicleAlert,
} from '../types/alert';
import { api } from './api';

export async function getAlerts(
  query: AlertsQuery = {},
): Promise<AlertsPageResponse> {
  const { data } = await api.get<AlertsPageResponse>('/alerts', {
    params: query,
  });
  return data;
}

export async function acknowledgeAlert(id: string): Promise<VehicleAlert> {
  const { data } = await api.patch<VehicleAlert>(`/alerts/${id}/acknowledge`);
  return data;
}
