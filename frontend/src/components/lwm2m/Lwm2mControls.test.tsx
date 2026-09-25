import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { theme } from '../../theme/theme';
import type { Lwm2mResource } from '../../types/vehicle';
import { Lwm2mControls } from './Lwm2mControls';

const resources: Lwm2mResource[] = [
  { id: 0, name: 'Intervalo', operations: 'RW', path: '/32769/0/0', type: 'INTEGER', value: 30, available: true },
  { id: 11, name: 'Alerta remota', operations: 'RW', path: '/32769/0/11', type: 'BOOLEAN', value: false, available: true },
  ...[23, 24, 25, 32, 33].map((id) => ({ id, name: `Luz ${id}`, operations: 'RW' as const, path: `/32769/0/${id}`, type: 'BOOLEAN', value: false, available: true })),
];

function renderControls(canManage: boolean, pending = false) {
  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={new QueryClient()}>
        <Lwm2mControls vehicleId="vehicle-1" resources={resources} canManage={canManage} registered pending={pending} onUpdated={vi.fn()} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Lwm2mControls', () => {
  it('impide enviar comandos a un usuario VIEWER', () => {
    renderControls(false);

    expect(screen.getByRole('button', { name: 'Aplicar intervalo' })).toBeDisabled();
    expect(screen.getByText(/cuenta es de consulta/i)).toBeInTheDocument();
  });

  it('bloquea controles cuando hay una operación pendiente', () => {
    renderControls(true, true);

    expect(screen.getByRole('button', { name: 'Aplicar intervalo' })).toBeDisabled();
    expect(screen.getByText(/comando en curso/i)).toBeInTheDocument();
  });
});
