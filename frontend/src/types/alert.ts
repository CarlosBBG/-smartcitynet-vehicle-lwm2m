export type AlertType =
  | 'LOCAL_PANIC'
  | 'LOW_BATTERY'
  | 'VEHICLE_OFFLINE'
  | 'LWM2M_DISCONNECTED'
  | 'SYSTEM';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AlertVehicle {
  id: string;
  name: string;
  deviceId: string;
}

export interface VehicleAlert {
  id: string;
  vehicleId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  active: boolean;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  metadata: Record<string, unknown> | null;
  vehicle?: AlertVehicle | null;
}

export interface AlertsSummary {
  active: number;
  critical: number;
  warning: number;
  acknowledged: number;
}

export interface AlertsPageResponse {
  items: VehicleAlert[];
  total: number;
  page: number;
  limit: number;
  summary: AlertsSummary;
}

export interface AlertsQuery {
  active?: 'true' | 'false';
  acknowledged?: 'true' | 'false';
  severity?: AlertSeverity;
  type?: AlertType;
  vehicleId?: string;
  page?: number;
  limit?: number;
}
