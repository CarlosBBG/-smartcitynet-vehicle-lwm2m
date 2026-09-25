import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setLight, setRemoteAlert } from '../../services/vehicles.service';
import { theme } from '../../theme/theme';
import type { Lwm2mResource, Operation, Telemetry } from '../../types/vehicle';
import { confirmedActuatorState } from '../../utils/confirmed-actuator-state';
import { VehicleOverview } from './VehicleOverview';

vi.mock('../../services/vehicles.service', () => ({ setLight: vi.fn(), setRemoteAlert: vi.fn(), setTransmissionInterval: vi.fn() }));

const sample: Telemetry = {
  id: 'sample-1', vehicleId: 'vehicle-1', receivedAt: '2026-09-23T12:00:00.000Z',
  uplinkCounter: 10, transmissionIntervalSeconds: 30, batteryMv: 11_700,
  batteryPercent: 74, rssi: -96, snr: 7.5, movement: 'Detenido', speedPercent: 0,
  frontDistanceCm: 120, rearDistanceCm: 999, pitchDegrees: 0, rollDegrees: 0,
  temperatureC: 26, latitude: null, longitude: null, gpsAvailable: false,
  ambientTemperatureC: 23, ambientHumidityPercent: 50, dhtAvailable: true,
  localPanicActive: false, remoteAlertActive: false,
  rawState: { front_light_on: true, rear_light_on: false, parking_lights_on: true, left_indicator_on: false, right_indicator_on: false, events: ['obstacle'] },
  createdAt: '2026-09-23T12:00:00.000Z',
};

const resources: Lwm2mResource[] = [
  { id: 11, name: 'Alerta remota', path: '/32769/0/11', type: 'boolean', operations: 'RW', value: false, available: true },
  ...([
    [23, true], [24, false], [25, true], [32, false], [33, false],
  ] as const).map(([id, value]) => ({ id, name: `Luz ${id}`, path: `/32769/0/${id}`, type: 'boolean', operations: 'RW' as const, value, available: true })),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setLight).mockResolvedValue({ accepted: true, state: 'requested', operation: null });
  vi.mocked(setRemoteAlert).mockResolvedValue({ accepted: true, state: 'requested', operation: null });
});

function renderOverview({
  telemetry = sample, canManage = true, registered = true, pending = false, online = true,
  lwm2mResources = resources, operations = [],
}: {
  telemetry?: Telemetry | null;
  canManage?: boolean;
  registered?: boolean;
  pending?: boolean;
  online?: boolean;
  lwm2mResources?: Lwm2mResource[];
  operations?: Operation[];
} = {}) {
  const onUpdated = vi.fn().mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <VehicleOverview telemetry={telemetry} actuators={confirmedActuatorState(telemetry, operations)} online={online} vehicleId="vehicle-1" resources={lwm2mResources} canManage={canManage} registered={registered} pending={pending} onUpdated={onUpdated} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return onUpdated;
}

describe('VehicleOverview', () => {
  it('muestra la vista aérea, distancias, eventos y estados físicos de luces', () => {
    renderOverview();
    expect(screen.getByText('120 cm')).toBeInTheDocument();
    expect(screen.getByText('Fuera de rango')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /luces frontales encendidas, traseras apagadas/i })).toBeInTheDocument();
    expect(screen.getByText('Obstáculo')).toBeInTheDocument();
    expect(screen.getByText('Iluminación')).toBeInTheDocument();
    expect(screen.getByText('Seguridad')).toBeInTheDocument();
    expect(screen.queryByText('Frecuencia de telemetría')).not.toBeInTheDocument();
  });

  it('envía una luz desde la vista aérea sin cambiar el dibujo antes del ACK', async () => {
    const user = userEvent.setup();
    const onUpdated = renderOverview();
    await user.click(screen.getByRole('switch', { name: 'Luz frontal' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Apagar luz frontal');
    expect(setLight).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(setLight).toHaveBeenCalledWith('vehicle-1', 'front', false));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('img', { name: /luces frontales encendidas/i })).toBeInTheDocument();
  });

  it('permite activar la alerta remota desde la misma vista', async () => {
    const user = userEvent.setup();
    renderOverview();
    await user.click(screen.getByRole('switch', { name: 'Alerta remota y bloqueo de motores' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(setRemoteAlert).toHaveBeenCalledWith('vehicle-1', true));
  });

  it('bloquea los controles para usuarios de consulta', () => {
    renderOverview({ canManage: false });
    expect(screen.getByRole('switch', { name: 'Luz frontal' })).toBeDisabled();
    expect(screen.getByText(/cuenta es de consulta/i)).toBeInTheDocument();
  });

  it('bloquea los controles si Leshan no registró el cliente', () => {
    renderOverview({ registered: false });
    expect(screen.getByRole('switch', { name: 'Luz frontal' })).toBeDisabled();
    expect(screen.getByText('El cliente LwM2M no está registrado en Leshan.')).toBeInTheDocument();
  });

  it('bloquea los controles mientras exista un comando pendiente', () => {
    renderOverview({ pending: true });
    expect(screen.getByRole('switch', { name: 'Luz frontal' })).toBeDisabled();
    expect(screen.getByText(/comando en curso/i)).toBeInTheDocument();
  });

  it('reutiliza el estado LwM2M para la acción y conserva el dibujo según telemetría', async () => {
    const user = userEvent.setup();
    renderOverview({ lwm2mResources: resources.map((resource) => resource.id === 23 ? { ...resource, value: false } : resource) });
    await user.click(screen.getByRole('switch', { name: 'Luz frontal' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Encender luz frontal');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(setLight).toHaveBeenCalledWith('vehicle-1', 'front', true));
    expect(screen.getByRole('img', { name: /luces frontales encendidas/i, hidden: true })).toBeInTheDocument();
  });

  it('no permite enviar una luz cuyo recurso LwM2M no está disponible', () => {
    renderOverview({ lwm2mResources: resources.map((resource) => resource.id === 23 ? { ...resource, available: false } : resource) });
    expect(screen.getByRole('switch', { name: 'Luz frontal' })).toBeDisabled();
  });

  it('no muestra actuadores apagados cuando falta la lectura', () => {
    renderOverview({ telemetry: null, online: false });
    expect(screen.getByText('Aún no hay telemetría disponible')).toBeInTheDocument();
    expect(screen.getAllByText('Sin lectura').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /luces frontales sin lectura, traseras sin lectura/i })).toBeInTheDocument();
  });

  it('avisa si muestra una lectura antigua y destaca pánico y alerta remota', () => {
    renderOverview({ telemetry: { ...sample, localPanicActive: true, remoteAlertActive: true, rawState: { ...sample.rawState, events: [] } }, online: false });
    expect(screen.getByRole('note')).toHaveTextContent('última telemetría recibida');
    expect(screen.getByText('Pánico local')).toBeInTheDocument();
    expect(screen.getByText('Alerta remota')).toBeInTheDocument();
  });

  it('refleja una luz confirmada sin esperar una nueva muestra de telemetría', () => {
    renderOverview({ operations: [{
      id: 'operation-1', vehicleId: 'vehicle-1', transactionId: 11,
      resourcePath: '/32769/0/23', requestedValue: false, status: 'acknowledged',
      commandStatus: 0, createdAt: '2026-09-23T12:00:05.000Z', updatedAt: '2026-09-23T12:00:10.000Z',
    }] });
    expect(screen.getByRole('img', { name: /luces frontales apagadas, traseras apagadas/i })).toBeInTheDocument();
  });
});
