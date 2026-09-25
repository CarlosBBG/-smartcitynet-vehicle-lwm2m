import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../../context/AuthContext';
import { getUsers } from '../../services/users.service';
import { theme } from '../../theme/theme';
import { UsersPage } from './UsersPage';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/users.service', () => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  disableUser: vi.fn(),
}));

function renderPage() {
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <UsersPage />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      session: { accessToken: 'token', user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' } },
      authenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(getUsers).mockResolvedValue([
      { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', enabled: true, createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z' },
      { id: 'viewer-1', name: 'Consulta', email: 'viewer@example.com', role: 'VIEWER', enabled: true, createdAt: '2026-09-21T12:00:00Z', updatedAt: '2026-09-21T12:00:00Z' },
    ]);
  });

  it('muestra usuarios y protege la cuenta de la sesión actual', async () => {
    renderPage();
    const adminRow = (await screen.findByText('Admin · Tú')).closest('tr');
    const viewerRow = screen.getByText('viewer@example.com').closest('tr');
    expect(adminRow).not.toBeNull();
    expect(viewerRow).not.toBeNull();
    expect(within(adminRow!).queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(within(viewerRow!).getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
  });

  it('abre el formulario para crear una cuenta', async () => {
    renderPage();
    await screen.findByText('Admin · Tú');
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Crear usuario' })).toBeInTheDocument());
    expect(within(screen.getByRole('dialog')).getByLabelText(/Contraseña/)).toHaveAttribute('required');
  });
});
