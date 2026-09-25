import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../../context/AuthContext';
import { getAlerts } from '../../services/alerts.service';
import { theme } from '../../theme/theme';
import { AlertsPage } from './AlertsPage';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/alerts.service', () => ({
  getAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedGetAlerts = vi.mocked(getAlerts);

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AlertsPage />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('AlertsPage', () => {
  beforeEach(() => {
    mockedGetAlerts.mockResolvedValue({
      items: [{
        id: 'alert-1',
        vehicleId: 'vehicle-1',
        type: 'VEHICLE_OFFLINE',
        severity: 'WARNING',
        title: 'Vehículo sin conexión',
        message: 'Vehículo Norte superó el tiempo permitido sin telemetría.',
        active: true,
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
        createdAt: '2026-09-22T10:00:00Z',
        resolvedAt: null,
        metadata: null,
        vehicle: { id: 'vehicle-1', name: 'Vehículo Norte', deviceId: 'heltec-norte' },
      }],
      total: 1,
      page: 1,
      limit: 25,
      summary: { active: 1, critical: 0, warning: 1, acknowledged: 0 },
    });
  });

  it('muestra el incidente y permite reconocerlo a ADMIN', async () => {
    mockedUseAuth.mockReturnValue({
      session: { accessToken: 'token', user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' } },
      authenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();

    expect(await screen.findByText('Vehículo sin conexión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconocer' })).toBeInTheDocument();
  });

  it('mantiene la consulta sin acciones administrativas para VIEWER', async () => {
    mockedUseAuth.mockReturnValue({
      session: { accessToken: 'token', user: { id: 'viewer-1', name: 'Consulta', email: 'viewer@example.com', role: 'VIEWER' } },
      authenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();

    expect(await screen.findByText('Vehículo sin conexión')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconocer' })).not.toBeInTheDocument();
  });
});
