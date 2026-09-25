export type Lwm2mManagerClientState =
  'CREATED' | 'PROVISIONING' | 'RUNNING' | 'STOPPED' | 'ERROR';

export interface Lwm2mManagerClient {
  deviceId: string;
  endpoint: string;
  state: Lwm2mManagerClientState;
  registered: boolean;
  startedAt: string | null;
  lastError: string | null;
  created?: boolean;
}

export interface Lwm2mManagerHealth {
  status: string;
  clientCount: number;
  runningClients: number;
}

export interface Lwm2mManagerError {
  statusCode?: number;
  code?: string;
  message?: string;
}
