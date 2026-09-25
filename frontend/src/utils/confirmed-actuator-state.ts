import type { Operation, Telemetry } from '../types/vehicle';

export type LightKey =
  | 'front_light_on'
  | 'rear_light_on'
  | 'parking_lights_on'
  | 'left_indicator_on'
  | 'right_indicator_on';

export interface ActuatorState {
  front_light_on: boolean | null;
  rear_light_on: boolean | null;
  parking_lights_on: boolean | null;
  left_indicator_on: boolean | null;
  right_indicator_on: boolean | null;
  remote_alert_active: boolean | null;
}

const lightPaths: Record<string, LightKey> = {
  '/32769/0/23': 'front_light_on',
  '/32769/0/24': 'rear_light_on',
  '/32769/0/25': 'parking_lights_on',
  '/32769/0/32': 'left_indicator_on',
  '/32769/0/33': 'right_indicator_on',
};

function booleanValue(value: unknown): boolean | null {
  if (value === true || value === 1 || value === 'true') return true;
  if (value === false || value === 0 || value === 'false') return false;
  return null;
}

export function confirmedActuatorState(
  telemetry: Pick<Telemetry, 'receivedAt' | 'remoteAlertActive' | 'rawState'> | null | undefined,
  operations: Operation[],
): ActuatorState {
  const raw = telemetry?.rawState ?? {};
  const state: ActuatorState = {
    front_light_on: booleanValue(raw.front_light_on),
    rear_light_on: booleanValue(raw.rear_light_on),
    parking_lights_on: booleanValue(raw.parking_lights_on),
    left_indicator_on: booleanValue(raw.left_indicator_on),
    right_indicator_on: booleanValue(raw.right_indicator_on),
    remote_alert_active: telemetry ? telemetry.remoteAlertActive : null,
  };
  const telemetryTime = telemetry ? Date.parse(telemetry.receivedAt) : Number.NEGATIVE_INFINITY;

  // El ACK llega por un uplink independiente: no crea una nueva muestra de telemetría.
  // SQLite guarda la hora del ACK en segundos, por eso se compara con esa precisión.
  const confirmed = operations
    .filter((operation) => {
      const updatedAt = Date.parse(operation.updatedAt);
      return operation.status === 'acknowledged'
        && Number.isFinite(updatedAt)
        && (!Number.isFinite(telemetryTime) || Math.floor(updatedAt / 1000) >= Math.floor(telemetryTime / 1000));
    })
    .toSorted((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt) || a.transactionId - b.transactionId);

  for (const operation of confirmed) {
    const value = booleanValue(operation.requestedValue);
    if (value === null) continue;
    if (operation.resourcePath === '/32769/0/11') {
      state.remote_alert_active = value;
      continue;
    }
    const key = lightPaths[operation.resourcePath];
    if (!key) continue;
    state[key] = value;
    // Estos modos son mutuamente excluyentes en el firmware y en el Bridge.
    if (value && key === 'parking_lights_on') {
      state.left_indicator_on = false;
      state.right_indicator_on = false;
    } else if (value && key === 'left_indicator_on') {
      state.parking_lights_on = false;
      state.right_indicator_on = false;
    } else if (value && key === 'right_indicator_on') {
      state.parking_lights_on = false;
      state.left_indicator_on = false;
    }
  }

  return state;
}
