import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { getLatestTelemetry } from '../../services/vehicles.service';
import { theme } from '../../theme/theme';
import type { Vehicle } from '../../types/vehicle';
import { VehicleTable } from './VehicleTable';

vi.mock('../../services/vehicles.service', () => ({ getLatestTelemetry: vi.fn() }));

const mockedTelemetry = vi.mocked(getLatestTelemetry);
const vehicle: Vehicle = {
  id: 'vehicle-1',
  name: 'Unidad Norte',
  deviceId: 'smartcitynet-heltec-norte',
  devEui: '70B3D57ED006ABCD',
  lwm2mEndpoint: 'smartcitynet-heltec-norte',
  model: 'Heltec WiFi LoRa 32 V3',
  description: null,
  enabled: true,
  status: 'ONLINE',
  lastSeen: '2026-09-21T16:00:00.000Z',
  lastUplinkCounter: 18,
  createdAt: '2026-09-21T15:00:00.000Z',
  updatedAt: '2026-09-21T16:00:00.000Z',
  deletedAt: null,
};

function renderTable(canManage: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onView = vi.fn();
  const onEdit = vi.fn();
  const onToggle = vi.fn();
  const rendered = render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <VehicleTable
          vehicles={[vehicle]}
          canManage={canManage}
          onView={onView}
          onEdit={onEdit}
          onToggle={onToggle}
        />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { ...rendered, onView, onEdit, onToggle };
}

describe('VehicleTable', () => {
  it('muestra identidad, estado y batería del vehículo', async () => {
    mockedTelemetry.mockResolvedValue({
      id: 'sample-1',
      vehicleId: vehicle.id,
      receivedAt: vehicle.lastSeen ?? '',
      uplinkCounter: 18,
      transmissionIntervalSeconds: 30,
      batteryMv: 11_700,
      batteryPercent: 74,
      rssi: -96,
      snr: 7.5,
      movement: 'Detenido',
      speedPercent: 0,
      frontDistanceCm: 120,
      rearDistanceCm: 140,
      pitchDegrees: 0,
      rollDegrees: 0,
      temperatureC: 26,
      latitude: null,
      longitude: null,
      gpsAvailable: false,
      ambientTemperatureC: null,
      ambientHumidityPercent: null,
      dhtAvailable: false,
      localPanicActive: false,
      remoteAlertActive: false,
      rawState: {},
      createdAt: vehicle.lastSeen ?? '',
    });
    renderTable(true);

    expect(screen.getByText('Unidad Norte')).toBeInTheDocument();
    expect(screen.getAllByText('smartcitynet-heltec-norte')).toHaveLength(2);
    expect(screen.getByText('En línea')).toBeInTheDocument();
    expect(await screen.findByText('74%')).toBeInTheDocument();
  });

  it('oculta las operaciones administrativas a un VIEWER', async () => {
    mockedTelemetry.mockResolvedValue(null);
    const user = userEvent.setup();
    renderTable(false);

    expect(screen.queryByRole('button', { name: 'Acciones para Unidad Norte' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('row', { name: 'Acciones para Unidad Norte' }));

    expect(screen.getByRole('menuitem', { name: /ver/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /desactivar/i })).not.toBeInTheDocument();
  });

  it('abre las acciones desde cualquier celda y permite editar al administrador', async () => {
    mockedTelemetry.mockResolvedValue(null);
    const user = userEvent.setup();
    const { onEdit } = renderTable(true);

    await user.click(screen.getByText('En línea'));
    expect(screen.getByRole('menuitem', { name: /ver/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /desactivar/i })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /editar/i }));

    expect(onEdit).toHaveBeenCalledWith(vehicle);
    expect(screen.queryByRole('menuitem', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('permite abrir el menú con el teclado', async () => {
    mockedTelemetry.mockResolvedValue(null);
    const user = userEvent.setup();
    renderTable(true);
    const row = screen.getByRole('row', { name: 'Acciones para Unidad Norte' });

    row.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: /ver/i })).toBeInTheDocument();
  });
});
