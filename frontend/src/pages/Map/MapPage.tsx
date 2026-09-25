import { Box, Divider, Typography } from '@mui/material';
import { MapPin, Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';

import { FleetMap } from '../../components/dashboard/FleetMap';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../components/ui/QueryState';
import { SectionCard } from '../../components/ui/SectionCard';
import { StatusChip } from '../../components/ui/StatusChip';
import { useClockTick } from '../../hooks/use-clock-tick';
import { useFleetTelemetry, useVehicles } from '../../hooks/use-vehicles';
import { apiErrorMessage } from '../../services/api';
import type { Telemetry } from '../../types/vehicle';
import { formatRelativeTime } from '../../utils/format';

function hasLocation(sample: Telemetry | null | undefined): sample is Telemetry & { latitude: number; longitude: number } {
  return Boolean(sample?.gpsAvailable && typeof sample.latitude === 'number' && typeof sample.longitude === 'number');
}

export function MapPage() {
  const now = useClockTick();
  const vehiclesQuery = useVehicles();
  const vehicles = vehiclesQuery.data ?? [];
  const telemetryQuery = useFleetTelemetry(vehicles);

  if (vehiclesQuery.isPending) return <LoadingState label="Cargando vehículos" />;
  if (vehiclesQuery.isError) return <Box sx={{ p: 3 }}><ErrorState message={apiErrorMessage(vehiclesQuery.error)} /></Box>;

  const telemetry = telemetryQuery.data ?? {};
  const located = vehicles.filter((vehicle) => hasLocation(telemetry[vehicle.id]));

  return (
    <Box sx={{ p: { xs: 2, sm: 3.5 }, minHeight: '100%' }}>
      <PageHeader
        eyebrow="Ubicación"
        title="Mapa de los vehículos"
        description="Última posición GPS válida de cada vehículo; no representa seguimiento en tiempo real."
      />

      <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 300px' }, gap: 2, alignItems: 'start' }}>
        <SectionCard sx={{ minWidth: 0 }}>
          <Box sx={{ px: 2.25, py: 1.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Posiciones recibidas</Typography>
              <Typography variant="caption" color="text.secondary">{located.length} de {vehicles.length} vehículos con GPS</Typography>
            </Box>
            <Navigation size={18} aria-hidden="true" />
          </Box>
          <Divider />
          {telemetryQuery.isError ? (
            <Box sx={{ p: 3 }}><ErrorState message={apiErrorMessage(telemetryQuery.error)} /></Box>
          ) : (
            <FleetMap vehicles={vehicles} telemetry={telemetry} height="max(440px, calc(100dvh - 270px))" />
          )}
        </SectionCard>

        <SectionCard>
          <Box sx={{ px: 2.25, py: 1.75 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Vehículos</Typography>
            <Typography variant="caption" color="text.secondary">Seleccione uno para ver su detalle</Typography>
          </Box>
          <Divider />
          {vehicles.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2.25 }}>No hay vehículos registrados.</Typography>
          ) : vehicles.map((vehicle) => {
            const sample = telemetry[vehicle.id];
            return (
              <Box
                key={vehicle.id}
                component={Link}
                to={`/vehicles/${vehicle.id}`}
                sx={{ display: 'block', px: 2.25, py: 1.75, textDecoration: 'none', color: 'text.primary', borderBottom: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{vehicle.name}</Typography>
                  <StatusChip status={vehicle.status} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 0.75, color: 'text.secondary' }}>
                  <MapPin size={14} aria-hidden="true" />
                  <Typography variant="caption">
                    {hasLocation(sample) ? `${sample.latitude.toFixed(5)}, ${sample.longitude.toFixed(5)}` : 'Sin posición GPS'}
                  </Typography>
                </Box>
                {hasLocation(sample) && (
                  <Typography variant="caption" color="text.secondary">Recibida {formatRelativeTime(sample.receivedAt, now)}</Typography>
                )}
              </Box>
            );
          })}
        </SectionCard>
      </Box>
    </Box>
  );
}
