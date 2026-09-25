import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { theme } from '../../theme/theme';
import type { Operation } from '../../types/vehicle';
import { OperationProgress } from './OperationProgress';

const operation: Operation = {
  id: 'operation-1',
  vehicleId: 'vehicle-1',
  transactionId: 42,
  resourcePath: '/32769/0/23',
  requestedValue: true,
  status: 'acknowledged',
  commandStatus: 0,
  createdAt: '2026-09-22T10:00:00Z',
  updatedAt: '2026-09-22T10:00:04Z',
};

describe('OperationProgress', () => {
  it('muestra el recorrido confirmado de extremo a extremo', () => {
    render(<ThemeProvider theme={theme}><OperationProgress operation={operation} /></ThemeProvider>);

    expect(screen.getByText('Aplicado y confirmado')).toBeInTheDocument();
    expect(screen.getByText('Solicitado')).toBeInTheDocument();
    expect(screen.getByText('Cola TTN')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
  });

  it('explica un fallo de entrega', () => {
    render(<ThemeProvider theme={theme}><OperationProgress operation={{ ...operation, status: 'timed_out' }} /></ThemeProvider>);

    expect(screen.getByText('Tiempo agotado')).toBeInTheDocument();
    expect(screen.getByText(/no llegó a confirmarse/i)).toBeInTheDocument();
  });
});
