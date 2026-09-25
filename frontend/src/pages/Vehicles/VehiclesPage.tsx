import {
  Box,
  Button,
  InputAdornment,
  MenuItem,
  Snackbar,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../components/ui/QueryState';
import { SectionCard } from '../../components/ui/SectionCard';
import { statusLabel } from '../../components/ui/StatusChip';
import { VehicleDialog } from '../../components/vehicles/VehicleDialog';
import { VehicleTable } from '../../components/vehicles/VehicleTable';
import { useAuth } from '../../context/AuthContext';
import { useVehicles, vehicleKeys } from '../../hooks/use-vehicles';
import { apiErrorMessage } from '../../services/api';
import { createVehicle, updateVehicle } from '../../services/vehicles.service';
import type { Vehicle, VehicleInput, VehicleStatus } from '../../types/vehicle';

const vehicleStatuses = [
  'ONLINE',
  'OFFLINE',
  'PENDING_DISCOVERY',
  'LWM2M_DISCONNECTED',
  'ERROR',
  'DISABLED',
] as const satisfies readonly VehicleStatus[];

function isVehicleStatus(value: string): value is VehicleStatus {
  return vehicleStatuses.some((status) => status === value);
}

const statusOptions: Array<{ value: '' | VehicleStatus; label: string }> = [
  { value: '', label: 'Todos los estados' },
  ...vehicleStatuses.map((status) => ({ value: status, label: statusLabel(status) })),
];

export function VehiclesPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const vehiclesQuery = useVehicles();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | VehicleStatus>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = session?.user.role === 'ADMIN';

  const saveMutation = useMutation({
    mutationFn: async (input: VehicleInput) =>
      editing
        ? updateVehicle(editing.id, {
            name: input.name,
            devEui: input.devEui,
            model: input.model,
            description: input.description,
            enabled: input.enabled,
          })
        : createVehicle(input),
    onSuccess: async (vehicle) => {
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      setDialogOpen(false);
      setEditing(null);
      setNotice(editing ? 'Cambios guardados.' : `${vehicle.name} fue registrado.`);
    },
    onError: (error) => setDialogError(apiErrorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: (vehicle: Vehicle) => updateVehicle(vehicle.id, { enabled: !vehicle.enabled }),
    onSuccess: async (vehicle) => {
      await queryClient.invalidateQueries({ queryKey: vehicleKeys.all });
      setNotice(vehicle.enabled ? 'Vehículo activado.' : 'Vehículo desactivado.');
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (vehiclesQuery.data ?? []).filter((vehicle) => {
      const matchesTerm =
        !term ||
        [vehicle.name, vehicle.deviceId, vehicle.devEui ?? '', vehicle.model]
          .some((value) => value.toLowerCase().includes(term));
      return matchesTerm && (!status || vehicle.status === status);
    });
  }, [search, status, vehiclesQuery.data]);

  const paginated = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const openCreate = () => {
    setEditing(null);
    setDialogError(null);
    setDialogOpen(true);
  };

  const openEdit = (vehicle: Vehicle) => {
    setEditing(vehicle);
    setDialogError(null);
    setDialogOpen(true);
  };

  if (vehiclesQuery.isPending) return <LoadingState label="Cargando vehículos" />;
  if (vehiclesQuery.isError) return <Box sx={{ p: 3 }}><ErrorState message={apiErrorMessage(vehiclesQuery.error)} /></Box>;

  return (
    <Box sx={{ p: { xs: 2, sm: 3.5 } }}>
      <PageHeader
        eyebrow="Inventario"
        title="Vehículos"
        description="Dispositivos TTN representados como clientes LwM2M en Eclipse Leshan."
        action={canManage ? { label: 'Registrar vehículo', icon: Plus, onClick: openCreate } : undefined}
      />

      <SectionCard sx={{ mt: 3 }}>
        <Box sx={{ px: 2.25, py: 1.75, display: 'flex', alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Inventario registrado</Typography>
            <Typography variant="caption" color="text.secondary">{filtered.length} de {vehiclesQuery.data?.length ?? 0} vehículos</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Seleccione una fila para ver sus acciones.</Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
            <TextField
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(0); }}
              placeholder="Buscar vehículo"
              aria-label="Buscar vehículo"
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> } }}
              sx={{ minWidth: { sm: 240 } }}
            />
            <TextField
              select
              value={status}
              onChange={(event) => {
                const nextStatus = event.target.value;
                if (nextStatus === '' || isVehicleStatus(nextStatus)) setStatus(nextStatus);
                setPage(0);
              }}
              aria-label="Filtrar por estado"
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><SlidersHorizontal size={16} /></InputAdornment>,
                },
                select: { displayEmpty: true },
              }}
              sx={{ minWidth: 190 }}
            >
              {statusOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
          </Box>
        </Box>

        {filtered.length === 0 ? (
          <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
            <Box>
              <Typography sx={{ fontWeight: 600 }}>No se encontraron vehículos</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Cambie la búsqueda o el filtro seleccionado.</Typography>
              {(search || status) && <Button color="inherit" sx={{ mt: 1.5 }} onClick={() => { setSearch(''); setStatus(''); }}>Limpiar filtros</Button>}
            </Box>
          </Box>
        ) : (
          <VehicleTable
            vehicles={paginated}
            canManage={canManage}
            onView={(vehicle) => navigate(`/vehicles/${vehicle.id}`)}
            onEdit={openEdit}
            onToggle={(vehicle) => toggleMutation.mutate(vehicle)}
          />
        )}
        <TablePagination
          component="div"
          count={filtered.length}
          page={Math.min(page, Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1))}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25]}
          labelRowsPerPage="Filas por página"
        />
      </SectionCard>

      <VehicleDialog
        open={dialogOpen}
        vehicle={editing}
        pending={saveMutation.isPending}
        error={dialogError}
        onClose={() => setDialogOpen(false)}
        onSave={(input) => saveMutation.mutateAsync(input).then(() => undefined)}
      />
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice} />
    </Box>
  );
}
