import { describe, expect, it } from 'vitest';

import type { Operation, Telemetry } from '../types/vehicle';
import { confirmedActuatorState } from './confirmed-actuator-state';

const telemetry: Pick<Telemetry, 'receivedAt' | 'remoteAlertActive' | 'rawState'> = {
  receivedAt: '2026-09-25T12:00:00.500Z',
  remoteAlertActive: false,
  rawState: {
    front_light_on: false,
    rear_light_on: true,
    parking_lights_on: false,
    left_indicator_on: false,
    right_indicator_on: false,
  },
};

function operation(path: string, value: boolean, status: Operation['status'], updatedAt: string): Operation {
  return {
    id: `${path}-${updatedAt}`, vehicleId: 'vehicle-1', transactionId: 1,
    resourcePath: path, requestedValue: value, status,
    commandStatus: status === 'acknowledged' ? 0 : null,
    createdAt: '2026-09-25T12:00:01.000Z', updatedAt,
  };
}

describe('confirmedActuatorState', () => {
  it('conserva la última telemetría mientras el comando está pendiente o fue rechazado', () => {
    const commands = [
      operation('/32769/0/23', true, 'ttn_sent', '2026-09-25T12:00:05.000Z'),
      operation('/32769/0/24', false, 'rejected', '2026-09-25T12:00:06.000Z'),
    ];
    const state = confirmedActuatorState(telemetry, commands);
    expect(state.front_light_on).toBe(false);
    expect(state.rear_light_on).toBe(true);
  });

  it('aplica el ACK a luces y bloqueo sin un nuevo uplink de telemetría', () => {
    const state = confirmedActuatorState(telemetry, [
      operation('/32769/0/23', true, 'acknowledged', '2026-09-25T12:00:05.000Z'),
      operation('/32769/0/11', true, 'acknowledged', '2026-09-25T12:00:06.000Z'),
    ]);
    expect(state.front_light_on).toBe(true);
    expect(state.remote_alert_active).toBe(true);
  });

  it('da prioridad a la telemetría posterior al ACK', () => {
    const state = confirmedActuatorState(telemetry, [
      operation('/32769/0/23', true, 'acknowledged', '2026-09-25T11:59:59.000Z'),
    ]);
    expect(state.front_light_on).toBe(false);
  });

  it('respeta el orden y la exclusividad de parqueo y direccionales', () => {
    const state = confirmedActuatorState(telemetry, [
      operation('/32769/0/32', true, 'acknowledged', '2026-09-25T12:00:08.000Z'),
      operation('/32769/0/25', true, 'acknowledged', '2026-09-25T12:00:04.000Z'),
    ]);
    expect(state.left_indicator_on).toBe(true);
    expect(state.right_indicator_on).toBe(false);
    expect(state.parking_lights_on).toBe(false);
  });
});
