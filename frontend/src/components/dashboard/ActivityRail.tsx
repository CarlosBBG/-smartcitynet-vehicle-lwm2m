import { Box, Divider, Typography } from '@mui/material';
import { AlertTriangle, CarFront, ShieldAlert, WifiOff } from 'lucide-react';

import { useClockTick } from '../../hooks/use-clock-tick';
import { tokens } from '../../theme/tokens';
import type { VehicleAlert } from '../../types/alert';
import type { Vehicle } from '../../types/vehicle';
import { formatRelativeTime } from '../../utils/format';

export function ActivityRail({ vehicles, alerts }: { vehicles: Vehicle[]; alerts: VehicleAlert[] }) {
  const now = useClockTick();
  const recent = vehicles
    .toSorted((a, b) => new Date(b.lastSeen ?? 0).getTime() - new Date(a.lastSeen ?? 0).getTime())
    .slice(0, 5);

  return (
    <Box
      component="aside"
      sx={{
        display: { xs: 'none', xl: 'block' },
        width: tokens.shell.railWidth,
        flex: `0 0 ${tokens.shell.railWidth}px`,
        borderLeft: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: 2,
      }}
    >
      <Typography variant="body2" sx={{ px: 0.5, py: 1, fontWeight: 600 }}>Alertas recientes</Typography>
      <Box sx={{ mt: 0.5 }}>
        {alerts.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            No hay incidentes activos.
          </Typography>
        ) : (
          alerts.slice(0, 4).map((alert) => (
            <Box key={alert.id} sx={{ display: 'flex', gap: 1.25, p: 1, borderRadius: 1.5, '&:hover': { bgcolor: 'rgba(23,25,39,.025)' } }}>
              <Box sx={{ mt: 0.25, width: 30, height: 30, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: alert.severity === 'CRITICAL' ? '#ffeaed' : '#fff4dc', color: alert.severity === 'CRITICAL' ? '#b83c4a' : '#9b6611' }}>
                {alert.severity === 'CRITICAL' ? <ShieldAlert size={15} /> : <AlertTriangle size={15} />}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{alert.title}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{alert.vehicle?.name ?? 'Sistema'} · {formatRelativeTime(alert.createdAt, now)}</Typography>
              </Box>
            </Box>
          ))
        )}
      </Box>
      <Divider sx={{ my: 2 }} />
      <Typography variant="body2" sx={{ px: 0.5, py: 1, fontWeight: 600 }}>Actividad de los vehículos</Typography>
      {recent.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>Todavía no hay vehículos registrados.</Typography> : recent.map((vehicle) => (
        <Box key={vehicle.id} sx={{ display: 'flex', gap: 1.25, p: 1, borderRadius: 1.5, '&:hover': { bgcolor: 'rgba(23,25,39,.025)' } }}>
          <Box sx={{ mt: 0.25, width: 30, height: 30, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: vehicle.status === 'ONLINE' ? tokens.color.mintSoft : '#f0f1f3', color: vehicle.status === 'ONLINE' ? tokens.color.mint : '#737987' }}>{vehicle.status === 'ONLINE' ? <CarFront size={15} /> : <WifiOff size={15} />}</Box>
          <Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{vehicle.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{formatRelativeTime(vehicle.lastSeen, now)}</Typography></Box>
        </Box>
      ))}
    </Box>
  );
}
