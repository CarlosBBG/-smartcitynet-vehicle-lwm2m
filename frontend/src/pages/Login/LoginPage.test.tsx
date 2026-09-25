import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../../context/AuthContext';
import { theme } from '../../theme/theme';
import { LoginPage } from './LoginPage';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);

function renderLogin() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('LoginPage', () => {
  const login = vi.fn();

  beforeEach(() => {
    login.mockReset();
    mockedUseAuth.mockReturnValue({
      session: null,
      authenticated: false,
      login,
      logout: vi.fn(),
    });
  });

  it('envía el correo y la contraseña al contexto de autenticación', async () => {
    login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/correo electrónico/i), 'admin@smartcitynet.local');
    await user.type(screen.getByLabelText(/^contraseña/i), 'clave-segura-2026');
    await user.click(screen.getByRole('button', { name: 'Entrar a SmartCityNet' }));

    expect(login).toHaveBeenCalledWith({
      email: 'admin@smartcitynet.local',
      password: 'clave-segura-2026',
    });
  });

  it('permite mostrar y ocultar la contraseña', async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText(/^contraseña/i);

    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
