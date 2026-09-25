import {
  Box,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Edit3, Eye, Power } from 'lucide-react';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';

import { useClockTick } from '../../hooks/use-clock-tick';
import { useLatestTelemetry } from '../../hooks/use-vehicles';
import type { Vehicle } from '../../types/vehicle';
import { formatBattery, formatDateTime, formatRelativeTime } from '../../utils/format';
import { StatusChip } from '../ui/StatusChip';

interface VehicleTableProps {
  vehicles: Vehicle[];
  canManage: boolean;
  onView: (vehicle: Vehicle) => void;
  onEdit: (vehicle: Vehicle) => void;
  onToggle: (vehicle: Vehicle) => void;
}

function VehicleRow({ vehicle, canManage, onView, onEdit, onToggle, now }: Omit<VehicleTableProps, 'vehicles'> & { vehicle: Vehicle; now: number }) {
  const telemetry = useLatestTelemetry(vehicle.id);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const openActions = (event: MouseEvent<HTMLTableRowElement>) => {
    setMenuPosition({ top: event.clientY, left: event.clientX });
  };
  const openActionsWithKeyboard = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: bounds.bottom, left: bounds.left + Math.min(bounds.width / 2, 240) });
  };

  return (
    <TableRow
      hover
      selected={Boolean(menuPosition)}
      onClick={openActions}
      onKeyDown={openActionsWithKeyboard}
      tabIndex={0}
      aria-label={`Acciones para ${vehicle.name}`}
      aria-haspopup="menu"
      aria-expanded={Boolean(menuPosition)}
      sx={{ cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
    >
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: 'rgba(23,25,39,.05)', fontSize: 12, fontWeight: 700 }}>
            {vehicle.name.slice(0, 2).toUpperCase()}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{vehicle.name}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{vehicle.model}</Typography>
          </Box>
        </Box>
        <Menu
          anchorReference="anchorPosition"
          anchorPosition={menuPosition ?? undefined}
          open={Boolean(menuPosition)}
          onClose={() => setMenuPosition(null)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <MenuItem onClick={() => { setMenuPosition(null); onView(vehicle); }}>
            <Eye size={16} style={{ marginRight: 10 }} /> Ver
          </MenuItem>
          {canManage && (
            <MenuItem onClick={() => { setMenuPosition(null); onEdit(vehicle); }}>
              <Edit3 size={16} style={{ marginRight: 10 }} /> Editar
            </MenuItem>
          )}
          {canManage && (
            <MenuItem onClick={() => { setMenuPosition(null); onToggle(vehicle); }}>
              <Power size={16} style={{ marginRight: 10 }} />
              {vehicle.enabled ? 'Desactivar' : 'Activar'}
            </MenuItem>
          )}
        </Menu>
      </TableCell>
      <TableCell><Typography variant="body2" className="mono">{vehicle.deviceId}</Typography></TableCell>
      <TableCell><Typography variant="body2" className="mono">{vehicle.devEui ?? '—'}</Typography></TableCell>
      <TableCell><StatusChip status={vehicle.status} /></TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{vehicle.status === 'LWM2M_DISCONNECTED' ? 'Desconectado' : vehicle.enabled ? 'Gestionado' : 'Detenido'}</Typography>
        <Typography variant="caption" color="text.secondary" className="mono">{vehicle.lwm2mEndpoint}</Typography>
      </TableCell>
      <TableCell title={formatDateTime(vehicle.lastSeen)}>
        <Typography variant="body2">{formatRelativeTime(vehicle.lastSeen, now)}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatBattery(telemetry.data?.batteryPercent)}</Typography>
      </TableCell>
    </TableRow>
  );
}

export function VehicleTable(props: VehicleTableProps) {
  const now = useClockTick();
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table aria-label="Vehículos registrados" sx={{ minWidth: 1040 }}>
        <TableHead>
          <TableRow>
            {['Nombre', 'Device ID', 'DevEUI', 'Estado', 'LwM2M', 'Última comunicación', 'Batería'].map((heading) => (
              <TableCell key={heading} sx={{ color: 'text.secondary', fontSize: 12, whiteSpace: 'nowrap' }}>
                {heading}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {props.vehicles.map((vehicle) => (
            <VehicleRow key={vehicle.id} vehicle={vehicle} now={now} {...props} />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
