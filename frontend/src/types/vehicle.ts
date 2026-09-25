export type VehicleStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'PENDING_DISCOVERY'
  | 'LWM2M_DISCONNECTED'
  | 'ERROR'
  | 'DISABLED';

export interface Vehicle {
  id: string;
  name: string;
  deviceId: string;
  devEui: string | null;
  lwm2mEndpoint: string;
  model: string;
  description: string | null;
  enabled: boolean;
  status: VehicleStatus;
  lastSeen: string | null;
  lastUplinkCounter: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface VehicleInput {
  name: string;
  deviceId: string;
  devEui?: string;
  model: string;
  description?: string;
  enabled?: boolean;
}

export interface Telemetry {
  id: string;
  vehicleId: string;
  receivedAt: string;
  uplinkCounter: number | null;
  transmissionIntervalSeconds: number | null;
  batteryMv: number | null;
  batteryPercent: number | null;
  rssi: number | null;
  snr: number | null;
  movement: string | null;
  speedPercent: number | null;
  frontDistanceCm: number | null;
  rearDistanceCm: number | null;
  pitchDegrees: number | null;
  rollDegrees: number | null;
  temperatureC: number | null;
  latitude: number | null;
  longitude: number | null;
  gpsAvailable: boolean;
  ambientTemperatureC: number | null;
  ambientHumidityPercent: number | null;
  dhtAvailable: boolean;
  localPanicActive: boolean;
  remoteAlertActive: boolean;
  rawState: Record<string, unknown>;
  createdAt: string;
}

export interface TelemetryPage {
  items: Telemetry[];
  page: number;
  limit: number;
  total: number;
}

export type OperationStatus =
  | 'requested'
  | 'published'
  | 'ttn_queued'
  | 'ttn_sent'
  | 'lorawan_acknowledged'
  | 'acknowledged'
  | 'rejected'
  | 'timed_out'
  | 'ttn_failed'
  | 'publish_failed';

export interface Operation {
  id: string;
  vehicleId: string;
  transactionId: number;
  resourcePath: string;
  requestedValue: boolean | number | string | null;
  status: OperationStatus;
  commandStatus: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lwm2mResource {
  id: number;
  name: string;
  operations: 'R' | 'RW';
  unit?: string;
  path: string;
  type: string;
  value: unknown;
  available: boolean;
}

export interface Lwm2mDetails {
  endpoint: string;
  registered: boolean;
  server: string;
  registration: {
    registrationId: string;
    lastUpdate: number;
    lifetime: number;
    secure: boolean;
    version: string;
  } | null;
  objects: number[];
  resources: Lwm2mResource[];
}

export interface Lwm2mWriteResponse {
  accepted: boolean;
  state: OperationStatus;
  operation: Operation | null;
}

export interface Lwm2mClientSummary {
  endpoint: string;
  registrationId: string;
  lastUpdate: number;
  lifetime: number;
  secure: boolean;
}

export interface Lwm2mClientsResponse {
  count: number;
  clients: Lwm2mClientSummary[];
}
