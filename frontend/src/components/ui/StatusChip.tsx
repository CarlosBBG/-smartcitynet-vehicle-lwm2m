import { Box, Chip } from '@mui/material';

import type { VehicleStatus } from '../../types/vehicle';
import { tokens } from '../../theme/tokens';

const statusConfig: Record<
  VehicleStatus,
  { label: string; color: string; background: string }
> = {
  ONLINE: { label: 'En línea', color: '#16735f', background: tokens.color.mintSoft },
  OFFLINE: { label: 'Sin conexión', color: '#6c7280', background: '#eef0f3' },
  PENDING_DISCOVERY: {
    label: 'Esperando uplink',
    color: '#846016',
    background: '#fff5dc',
  },
  LWM2M_DISCONNECTED: {
    label: 'LwM2M desconectado',
    color: '#9b4d40',
    background: tokens.color.coralSoft,
  },
  ERROR: { label: 'Error', color: '#a53a46', background: '#ffeaed' },
  DISABLED: { label: 'Desactivado', color: '#6d627b', background: '#f0edf5' },
};

export function StatusChip({ status }: { status: VehicleStatus }) {
  const config = statusConfig[status];
  return (
    <Chip
      size="small"
      label={config.label}
      icon={
        <Box
          component="span"
          aria-hidden="true"
          sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: config.color }}
        />
      }
      sx={{
        height: 28,
        color: config.color,
        backgroundColor: config.background,
        fontWeight: 600,
        '& .MuiChip-icon': { ml: 1 },
      }}
    />
  );
}

export function statusLabel(status: VehicleStatus): string {
  return statusConfig[status].label;
}
