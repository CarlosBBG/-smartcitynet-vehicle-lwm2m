import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { useAuth } from '../../context/AuthContext';
import { theme } from '../../theme/theme';
import { AppSidebar } from './AppSidebar';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));

function renderSidebar(role: 'ADMIN' | 'VIEWER') {
  vi.mocked(useAuth).mockReturnValue({
    session: { accessToken: 'token', user: { id: 'user-1', name: 'Operador', email: 'operador@example.com', role } },
    authenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
  render(<ThemeProvider theme={theme}><MemoryRouter><AppSidebar /></MemoryRouter></ThemeProvider>);
}

describe('AppSidebar', () => {
  it('muestra Mapa y Usuarios como rutas disponibles al administrador', () => {
    renderSidebar('ADMIN');
    expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/map');
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/users');
    expect(screen.queryByText('Disponible en una fase posterior')).not.toBeInTheDocument();
  });

  it('permite el mapa pero oculta la administración de usuarios a consulta', () => {
    renderSidebar('VIEWER');
    expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/map');
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });
});
