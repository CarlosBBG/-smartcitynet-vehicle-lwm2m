import { ThemeProvider } from '@mui/material';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRealtimeSync } from '../../hooks/use-realtime-sync';
import { theme } from '../../theme/theme';
import type { VehicleAlert } from '../../types/alert';
import { playNotificationSound } from '../../utils/notification-sound';
import { RealtimeBoundary } from './RealtimeBoundary';

vi.mock('../../hooks/use-realtime-sync', () => ({ useRealtimeSync: vi.fn() }));
vi.mock('../../utils/notification-sound', () => ({ playNotificationSound: vi.fn() }));

const alert: VehicleAlert = {
  id: 'alert-1',
  vehicleId: 'vehicle-1',
  type: 'LOCAL_PANIC',
  severity: 'CRITICAL',
  title: 'Botón de pánico activado',
  message: 'Vehículo laboratorio activó el botón de pánico.',
  active: true,
  acknowledged: false,
  acknowledgedBy: null,
  acknowledgedAt: null,
  createdAt: '2026-09-25T10:00:00Z',
  resolvedAt: null,
  metadata: null,
};

describe('RealtimeBoundary', () => {
  let emitAlert: (alert: VehicleAlert) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRealtimeSync).mockImplementation((onAlertCreated) => {
      emitAlert = onAlertCreated!;
    });
  });

  it('muestra alertas nuevas en orden y permite abrir la página de alertas', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <RealtimeBoundary><div>Contenido</div></RealtimeBoundary>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.queryByText(alert.title)).not.toBeInTheDocument();

    act(() => {
      emitAlert(alert);
      emitAlert({ ...alert, id: 'alert-2', title: 'Vehículo sin conexión' });
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(2);

    expect(screen.getByText(alert.title)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver alertas' })).toHaveAttribute('href', '/alerts');

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByText('Vehículo sin conexión')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    act(() => emitAlert(alert));
    expect(screen.queryByText(alert.title)).not.toBeInTheDocument();
    expect(playNotificationSound).toHaveBeenCalledTimes(2);
  });
});
