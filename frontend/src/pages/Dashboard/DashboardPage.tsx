import { Box, Divider, Typography } from '@mui/material';
import {
  BellRing,
  CarFront,
  CircleOff,
  RadioTower,
  Wifi,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { ActivityRail } from '../../components/dashboard/ActivityRail';
import { FleetMap } from '../../components/dashboard/FleetMap';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../components/ui/QueryState';
import { SectionCard } from '../../components/ui/SectionCard';
import { StatusChip } from '../../components/ui/StatusChip';
import {
  useAlerts,
} from '../../hooks/use-alerts';
import { useClockTick } from '../../hooks/use-clock-tick';
import {
  useFleetTelemetry,
  useLwm2mClients,
  useVehicles,
} from '../../hooks/use-vehicles';
import { apiErrorMessage } from '../../services/api';
import { tokens } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';

export function DashboardPage() {
  const now = useClockTick();
  const vehiclesQuery = useVehicles();
  const lwm2mQuery = useLwm2mClients();
  const vehicles = vehiclesQuery.data ?? [];
  const telemetryQuery = useFleetTelemetry(vehicles);
  const alertsQuery = useAlerts({ active: 'true', limit: 5 });

  if (vehiclesQuery.isPending) return <LoadingState label="Cargando estado de los vehículos" />;
  if (vehiclesQuery.isError) return <Box sx={{ p: 3 }}><ErrorState message={apiErrorMessage(vehiclesQuery.error)} /></Box>;

  const online = vehicles.filter(({ status }) => status === 'ONLINE').length;
  const offline = vehicles.filter(({ status }) => status === 'OFFLINE').length;

  return (
    <Box sx={{ display: 'flex', minHeight: '100%' }}>
      <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 3.5 } }}>
        <PageHeader
          eyebrow="Resumen operativo"
          title="Estado de los vehículos"
          description="Seguimiento de vehículos registrados, conectividad LwM2M y última actividad recibida."
        />

        <Box
          sx={{
            mt: 3,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(5, minmax(145px, 1fr))' },
            gap: 2,
          }}
        >
          <MetricCard label="Vehículos" value={vehicles.length} helper="Registrados" icon={CarFront} tint={tokens.color.blueSoft} color={tokens.color.blue} />
          <MetricCard label="En línea" value={online} helper="Telemetría reciente" icon={Wifi} tint={tokens.color.mintSoft} color={tokens.color.mint} />
          <MetricCard label="Sin conexión" value={offline} helper="Fuera del umbral" icon={CircleOff} tint="#f0f1f3" color="#737987" />
          <MetricCard label="Alertas activas" value={alertsQuery.data?.summary.active ?? '—'} helper={alertsQuery.isError ? 'No disponible' : 'Requieren atención'} icon={BellRing} tint={tokens.color.coralSoft} color={tokens.color.coral} />
          <MetricCard label="Clientes LwM2M" value={lwm2mQuery.data?.count ?? '—'} helper={lwm2mQuery.isError ? 'Leshan no disponible' : 'Registrados en Leshan'} icon={RadioTower} tint={tokens.color.purpleSoft} color={tokens.color.purple} />
        </Box>

        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(300px, .75fr)' }, gap: 2 }}>
          <SectionCard>
            <Box sx={{ px: 2.25, py: 1.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Ubicación de los vehículos</Typography>
                <Typography variant="caption" color="text.secondary">Última posición GPS válida</Typography>
              </Box>
              <Typography component={Link} to="/vehicles" variant="caption" sx={{ color: 'text.primary', textDecoration: 'none', fontWeight: 600 }}>
                Ver vehículos
              </Typography>
            </Box>
            <Divider />
            <FleetMap vehicles={vehicles} telemetry={telemetryQuery.data ?? {}} />
          </SectionCard>

          <SectionCard>
            <Box sx={{ px: 2.25, py: 1.75 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Última comunicación</Typography>
              <Typography variant="caption" color="text.secondary">Selecciona un vehículo para ver su detalle</Typography>
            </Box>
            <Divider />
            <Box sx={{ p: 1.25 }}>
              {vehicles.length === 0 ? (
                <Typography color="text.secondary" variant="body2" sx={{ p: 2 }}>No hay vehículos registrados.</Typography>
              ) : (
                vehicles
                  .toSorted((a, b) => new Date(b.lastSeen ?? 0).getTime() - new Date(a.lastSeen ?? 0).getTime())
                  .slice(0, 5)
                  .map((vehicle) => (
                    <Box
                      key={vehicle.id}
                      component={Link}
                      to={`/vehicles/${vehicle.id}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 1,
                        py: 1.15,
                        textDecoration: 'none',
                        color: 'text.primary',
                        borderRadius: 1,
                        '&:hover': { bgcolor: 'action.hover' },
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                        },
                      }}
                    >
                      <Box sx={{ width: 34, height: 34, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: 'rgba(23,25,39,.045)' }}>
                        <CarFront size={16} />
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                          {vehicle.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {formatRelativeTime(vehicle.lastSeen, now)}
                        </Typography>
                      </Box>

                      <StatusChip status={vehicle.status} />
                    </Box>
                  ))
              )}
            </Box>
          </SectionCard>
        </Box>
      </Box>
      <ActivityRail vehicles={vehicles} alerts={alertsQuery.data?.items ?? []} />
    </Box>
  );
}
