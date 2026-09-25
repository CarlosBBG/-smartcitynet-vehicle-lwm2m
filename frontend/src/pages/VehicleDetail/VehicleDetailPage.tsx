import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Activity,
  ArrowLeft,
  BatteryMedium,
  ChevronDown,
  Cloud,
  Compass,
  MapPin,
  Radio,
  Server,
  ShieldAlert,
  Thermometer,
  Wifi,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Lwm2mControls } from '../../components/lwm2m/Lwm2mControls';
import {
  OperationProgress,
  operationStatusLabel,
  pendingStatuses,
} from '../../components/lwm2m/OperationProgress';
import { TelemetryChart } from '../../components/telemetry/TelemetryChart';
import { VehicleMap } from '../../components/telemetry/VehicleMap';
import { ErrorState, LoadingState } from '../../components/ui/QueryState';
import { SectionCard } from '../../components/ui/SectionCard';
import { StatusChip } from '../../components/ui/StatusChip';
import { VehicleOverview } from '../../components/vehicles/VehicleOverview';
import { useAuth } from '../../context/AuthContext';
import { useClockTick } from '../../hooks/use-clock-tick';
import {
  useLatestTelemetry,
  useLwm2mDetails,
  useOperations,
  useTelemetryHistory,
  useVehicle,
} from '../../hooks/use-vehicles';
import { apiErrorMessage } from '../../services/api';
import { confirmedActuatorState, type ActuatorState, type LightKey } from '../../utils/confirmed-actuator-state';
import { formatDateTime, formatRelativeTime } from '../../utils/format';
import { toChartSamples } from '../../utils/telemetry-chart';
import type { Lwm2mResource, Telemetry } from '../../types/vehicle';

type TabName = 'summary' | 'telemetry' | 'map' | 'lwm2m' | 'operations';
type RangeName = '1h' | '6h' | '24h' | '7d' | 'custom';

const tabLabels: Array<{ value: TabName; label: string }> = [
  { value: 'summary', label: 'Resumen' },
  { value: 'telemetry', label: 'Telemetría' },
  { value: 'map', label: 'Mapa' },
  { value: 'lwm2m', label: 'LwM2M' },
  { value: 'operations', label: 'Operaciones' },
];

const ranges: Array<{ value: RangeName; label: string; seconds?: number }> = [
  { value: '1h', label: '1 h', seconds: 3_600 },
  { value: '6h', label: '6 h', seconds: 21_600 },
  { value: '24h', label: '24 h', seconds: 86_400 },
  { value: '7d', label: '7 d', seconds: 604_800 },
  { value: 'custom', label: 'Personalizado' },
];

function display(value: number | string | null | undefined, unit = ''): string {
  if (value === null || value === undefined || value === '') return 'Sin lectura';
  return `${value}${unit}`;
}

function boolState(value: boolean | null | undefined): string {
  return value ? 'Activa' : 'Inactiva';
}

function lightLabel(actuators: ActuatorState, key: LightKey): string {
  const value = actuators[key];
  return value === null ? 'Sin lectura' : value ? 'Encendida' : 'Apagada';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, py: 1.1 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>{value}</Typography>
    </Box>
  );
}

function SignalPath({ hasTelemetry, online, registered }: { hasTelemetry: boolean; online: boolean; registered: boolean }) {
  const nodes = [
    { label: 'Telemetría', icon: Activity, active: hasTelemetry, state: hasTelemetry ? 'Datos almacenados' : 'Sin lecturas' },
    { label: 'TTN', icon: Radio, active: online, state: online ? 'Enlace reciente' : 'Sin enlace reciente' },
    { label: 'Bridge', icon: Cloud, active: online, state: online ? 'Recibiendo datos' : 'Sin datos recientes' },
    { label: 'Leshan', icon: Server, active: registered, state: registered ? 'Cliente registrado' : 'No registrado' },
  ];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
      {nodes.map((node, index) => {
        const Icon = node.icon;
        return (
          <Box key={node.label} sx={{ position: 'relative', p: 1.5, borderRadius: 2, bgcolor: node.active ? '#eaf8f4' : '#f1f3f5', color: node.active ? '#16735f' : '#747b88' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Icon size={16} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{node.label}</Typography>
            </Box>
            <Typography variant="caption">{node.state}</Typography>
            {index < nodes.length - 1 && (
              <Box sx={{ display: { xs: 'none', sm: 'block' }, position: 'absolute', top: '50%', right: -7, width: 13, borderTop: '1px solid', borderColor: 'divider', zIndex: 2 }} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function SummaryTab({ telemetry, actuators, online, registered, resources, canManage, pending, vehicleId, onUpdated }: {
  telemetry: Telemetry | null | undefined;
  actuators: ActuatorState;
  online: boolean;
  registered: boolean;
  resources: Lwm2mResource[];
  canManage: boolean;
  pending: boolean;
  vehicleId: string;
  onUpdated: () => Promise<void>;
}) {
  const metrics = [
    { label: 'Batería', value: display(telemetry?.batteryPercent, '%'), detail: display(telemetry?.batteryMv, ' mV'), icon: BatteryMedium, color: '#4c98fd', bg: '#e6f1fd' },
    { label: 'Enlace LoRaWAN', value: display(telemetry?.rssi, ' dBm'), detail: `SNR ${display(telemetry?.snr, ' dB')}`, icon: Wifi, color: '#2b8f7b', bg: '#e3f8f2' },
    { label: 'Movimiento', value: telemetry?.movement ?? 'Sin lectura', detail: `Velocidad ${display(telemetry?.speedPercent, '%')}`, icon: Compass, color: '#7863c7', bg: '#edeefc' },
    { label: 'Ambiente', value: telemetry?.dhtAvailable ? display(telemetry.ambientTemperatureC, ' °C') : 'Sin lectura', detail: `Humedad ${telemetry?.dhtAvailable ? display(telemetry.ambientHumidityPercent, '%') : 'Sin lectura'}`, icon: Thermometer, color: '#c46934', bg: '#fff0e8' },
  ];

  return (
    <Box>
      <SectionCard sx={{ p: 2.25 }}>
        <Typography sx={{ fontWeight: 600, mb: 1.5 }}>Ruta de comunicación</Typography>
        <SignalPath hasTelemetry={Boolean(telemetry)} online={online} registered={registered} />
      </SectionCard>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mt: 2 }}>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <SectionCard key={metric.label} sx={{ p: 2.25, borderTop: `3px solid ${metric.color}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: metric.bg, color: metric.color }}><Icon size={19} /></Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{metric.label}</Typography>
                  <Typography sx={{ fontSize: 21, lineHeight: 1.2, fontWeight: 600 }}>{metric.value}</Typography>
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>{metric.detail}</Typography>
            </SectionCard>
          );
        })}
      </Box>
      <Box sx={{ mt: 2 }}>
        <VehicleOverview telemetry={telemetry} actuators={actuators} online={online} vehicleId={vehicleId} resources={resources} canManage={canManage} registered={registered} pending={pending} onUpdated={onUpdated} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mt: 2 }}>
        <SectionCard sx={{ p: 2.25 }}>
          <Typography sx={{ fontWeight: 600 }}>Distancias e inclinación</Typography>
          <Divider sx={{ mt: 1 }} />
          <DetailRow label="Distancia frontal" value={display(telemetry?.frontDistanceCm, ' cm')} />
          <Divider />
          <DetailRow label="Distancia trasera" value={display(telemetry?.rearDistanceCm, ' cm')} />
          <Divider />
          <DetailRow label="Pitch" value={display(telemetry?.pitchDegrees, '°')} />
          <Divider />
          <DetailRow label="Roll" value={display(telemetry?.rollDegrees, '°')} />
          <Divider />
          <DetailRow label="Temperatura MPU" value={display(telemetry?.temperatureC, ' °C')} />
        </SectionCard>
        <SectionCard sx={{ p: 2.25 }}>
          <Typography sx={{ fontWeight: 600 }}>Ubicación</Typography>
          <Divider sx={{ mt: 1 }} />
          <DetailRow label="GPS" value={telemetry?.gpsAvailable ? 'Disponible' : 'No disponible'} />
          <Divider />
          <DetailRow label="Latitud" value={display(telemetry?.latitude)} />
          <Divider />
          <DetailRow label="Longitud" value={display(telemetry?.longitude)} />
          <Divider />
          <DetailRow label="Última muestra" value={telemetry ? formatDateTime(telemetry.receivedAt) : 'Sin datos'} />
        </SectionCard>
        <SectionCard sx={{ p: 2.25 }}>
          <Typography sx={{ fontWeight: 600 }}>Seguridad e iluminación</Typography>
          <Divider sx={{ mt: 1 }} />
          <DetailRow label="Pánico local" value={telemetry ? boolState(telemetry.localPanicActive) : 'Sin lectura'} />
          <Divider />
          <DetailRow label="Alerta remota" value={actuators.remote_alert_active === null ? 'Sin lectura' : boolState(actuators.remote_alert_active)} />
          <Divider />
          <DetailRow label="Luz frontal" value={lightLabel(actuators, 'front_light_on')} />
          <Divider />
          <DetailRow label="Luz trasera" value={lightLabel(actuators, 'rear_light_on')} />
          <Divider />
          <DetailRow label="Parqueo" value={lightLabel(actuators, 'parking_lights_on')} />
        </SectionCard>
      </Box>
    </Box>
  );
}

function TelemetryTab({ vehicleId }: { vehicleId: string }) {
  const [range, setRange] = useState<RangeName>('1h');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [anchorMs, setAnchorMs] = useState(Date.now);
  const query = useMemo(() => {
    if (range === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : undefined,
        to: customTo ? new Date(customTo).toISOString() : undefined,
        limit: 500,
      };
    }
    const seconds = ranges.find((item) => item.value === range)?.seconds ?? 3_600;
    return {
      from: new Date(anchorMs - seconds * 1_000).toISOString(),
      to: new Date(anchorMs).toISOString(),
      limit: 500,
    };
  }, [anchorMs, customFrom, customTo, range]);
  const history = useTelemetryHistory(vehicleId, query);
  const chartData = useMemo(
    () => toChartSamples(history.data?.items ?? []),
    [history.data?.items],
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {ranges.map((item) => <Button key={item.value} size="small" variant={range === item.value ? 'contained' : 'outlined'} onClick={() => { setRange(item.value); setAnchorMs(Date.now()); }}>{item.label}</Button>)}
        </Box>
      </Box>
      {range === 'custom' && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <TextField label="Desde" type="datetime-local" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Hasta" type="datetime-local" value={customTo} onChange={(event) => setCustomTo(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
      )}
      {history.isError && <ErrorState message={apiErrorMessage(history.error)} />}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TelemetryChart title="Energía y señal" subtitle="Nivel de batería y potencia recibida" data={chartData} series={[{ key: 'battery', label: 'Batería', color: '#4c98fd', unit: '%' }, { key: 'rssi', label: 'RSSI', color: '#8b78d7', unit: 'dBm' }]} />
        <TelemetryChart title="Calidad y movimiento" subtitle="Relación señal/ruido y velocidad" data={chartData} series={[{ key: 'snr', label: 'SNR', color: '#2bb89c', unit: 'dB' }, { key: 'speed', label: 'Velocidad', color: '#ef715f', unit: '%' }]} />
        <TelemetryChart title="Ambiente" subtitle="Lecturas del sensor DHT" data={chartData} series={[{ key: 'temperature', label: 'Temperatura', color: '#ef715f', unit: '°C' }, { key: 'humidity', label: 'Humedad', color: '#4c98fd', unit: '%' }]} />
        <TelemetryChart title="Proximidad" subtitle="Sensores ultrasónicos frontal y trasero" data={chartData} series={[{ key: 'front', label: 'Frontal', color: '#2bb89c', unit: 'cm' }, { key: 'rear', label: 'Trasera', color: '#8b78d7', unit: 'cm' }]} />
      </Box>
    </Box>
  );
}

function ResourcesTable({ resources }: { resources: Lwm2mResource[] }) {
  return (
    <>
      <Box
        component="details"
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .resources-chevron': { flexShrink: 0, transition: 'transform 160ms ease' },
          '&[open] .resources-chevron': { transform: 'rotate(180deg)' },
          '@media (prefers-reduced-motion: reduce)': { '& .resources-chevron': { transition: 'none' } },
        }}
      >
        <Box
          component="summary"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            p: 2,
            cursor: 'pointer',
            listStyle: 'none',
            '&::-webkit-details-marker': { display: 'none' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>Recursos del objeto /32769/0</Typography>
            <Typography variant="caption" color="text.secondary">
              {resources.length} recursos · Lectura actual y permisos
            </Typography>
          </Box>
          <ChevronDown className="resources-chevron" size={20} aria-hidden="true" />
        </Box>
        {resources.map((resource) => (
          <Box key={resource.id} sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{resource.name}</Typography>
              <Chip size="small" label={resource.operations} variant="outlined" sx={{ flexShrink: 0 }} />
            </Box>
            <Typography variant="caption" color="text.secondary" className="mono" sx={{ display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>{resource.path}</Typography>
            <Typography variant="body2" sx={{ mt: 0.75, overflowWrap: 'anywhere' }}>
              {resource.available ? `${String(resource.value)}${resource.unit ? ` ${resource.unit}` : ''}` : 'No disponible'}
            </Typography>
          </Box>
        ))}
      </Box>
      <TableContainer sx={{ display: { xs: 'none', md: 'block' }, maxHeight: 600 }}>
        <Table size="small">
          <TableHead><TableRow><TableCell>Recurso</TableCell><TableCell>Ruta</TableCell><TableCell>Operaciones</TableCell><TableCell>Valor</TableCell></TableRow></TableHead>
          <TableBody>
            {resources.map((resource) => (
              <TableRow key={resource.id} hover>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500 }}>{resource.name}</Typography><Typography variant="caption" color="text.secondary">{resource.type}</Typography></TableCell>
                <TableCell><Typography variant="caption" className="mono">{resource.path}</Typography></TableCell>
                <TableCell><Chip size="small" label={resource.operations} variant="outlined" /></TableCell>
                <TableCell>{resource.available ? `${String(resource.value)}${resource.unit ? ` ${resource.unit}` : ''}` : 'No disponible'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

export function VehicleDetailPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const now = useClockTick();
  const [tab, setTab] = useState<TabName>('summary');
  const vehicle = useVehicle(id);
  const latest = useLatestTelemetry(id);
  const lwm2m = useLwm2mDetails(id);
  const operations = useOperations(id);
  const actuators = confirmedActuatorState(latest.data, operations.data ?? []);
  const latestOperation = operations.data?.[0] ?? null;
  const hasPending = operations.data?.some((item) => pendingStatuses.includes(item.status)) ?? false;

  if (vehicle.isPending) return <LoadingState label="Cargando vehículo" />;
  if (vehicle.isError) return <Box sx={{ p: 3 }}><ErrorState message={apiErrorMessage(vehicle.error)} /></Box>;
  if (!vehicle.data) return null;

  return (
    <Box sx={{ p: { xs: 2, sm: 3.5 } }}>
      <Button component={Link} to="/vehicles" color="inherit" startIcon={<ArrowLeft size={16} />} sx={{ mb: 1.5 }}>Vehículos</Button>
      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Typography component="h1" variant="h1">{vehicle.data.name}</Typography>
            <StatusChip status={vehicle.data.status} />
          </Box>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>{vehicle.data.deviceId} · {vehicle.data.model}</Typography>
        </Box>
        <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
          <Typography variant="caption" color="text.secondary">Última comunicación</Typography>
          <Typography sx={{ fontWeight: 600 }}>{formatRelativeTime(vehicle.data.lastSeen, now)}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDateTime(vehicle.data.lastSeen)}</Typography>
        </Box>
      </Box>

      <SectionCard sx={{ mt: 2.5 }}>
        <Tabs value={tab} onChange={(_, value: TabName) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Secciones del vehículo" sx={{ px: 1, minHeight: 50, '& .MuiTab-root': { minHeight: 50 } }}>
          {tabLabels.map((item) => <Tab key={item.value} value={item.value} label={item.label} />)}
        </Tabs>
      </SectionCard>

      <Box sx={{ mt: 2 }}>
        {tab === 'summary' && <SummaryTab telemetry={latest.data} actuators={actuators} online={vehicle.data.status === 'ONLINE'} registered={Boolean(lwm2m.data?.registered)} resources={lwm2m.data?.resources ?? []} canManage={session?.user.role === 'ADMIN'} pending={hasPending} vehicleId={id} onUpdated={async () => { await Promise.all([lwm2m.refetch(), operations.refetch(), latest.refetch()]); }} />}
        {tab === 'telemetry' && <TelemetryTab vehicleId={id} />}
        {tab === 'map' && (
          <SectionCard sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 2.25, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box><Typography sx={{ fontWeight: 600 }}>Última posición GPS</Typography><Typography variant="caption" color="text.secondary">Coordenadas válidas recibidas por telemetría</Typography></Box>
              {latest.data?.gpsAvailable && <Chip icon={<MapPin size={14} />} label={`${latest.data.latitude?.toFixed(5)}, ${latest.data.longitude?.toFixed(5)}`} variant="outlined" />}
            </Box>
            <Divider />
            <VehicleMap vehicle={vehicle.data} telemetry={latest.data} />
          </SectionCard>
        )}
        {tab === 'lwm2m' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.45fr) minmax(340px, .75fr)' }, alignItems: 'start', gap: 2 }}>
            <Box sx={{ display: { xs: 'contents', lg: 'flex' }, flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <SectionCard sx={{ order: 1, p: { xs: 2, sm: 2.25 }, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 600 }}>Cliente LwM2M</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{vehicle.data.lwm2mEndpoint}</Typography></Box>
                  <Chip label={lwm2m.data?.registered ? 'Registrado en Leshan' : 'No registrado'} color={lwm2m.data?.registered ? 'success' : 'default'} variant="outlined" />
                </Box>
                <Divider sx={{ my: 1.5 }} />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                  <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">Servidor</Typography><Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{lwm2m.data?.server ?? 'Eclipse Leshan'}</Typography></Box>
                  <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">Objetos</Typography><Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{lwm2m.data?.objects.map((value) => `/${value}`).join(', ') || 'Sin objetos'}</Typography></Box>
                  <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">Lifetime</Typography><Typography variant="body2" sx={{ fontWeight: 600 }}>{lwm2m.data?.registration ? `${lwm2m.data.registration.lifetime} s` : 'Sin registro'}</Typography></Box>
                </Box>
              </SectionCard>
              <SectionCard sx={{ order: 4, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={{ display: { xs: 'none', md: 'block' }, p: { xs: 2, sm: 2.25 } }}><Typography sx={{ fontWeight: 600 }}>Recursos del objeto /32769/0</Typography><Typography variant="caption" color="text.secondary">Lectura actual y permisos definidos por el modelo SmartCityNet</Typography></Box>
                <Divider sx={{ display: { xs: 'none', md: 'block' } }} />
                <ResourcesTable resources={lwm2m.data?.resources ?? []} />
              </SectionCard>
            </Box>
            <Box sx={{ display: { xs: 'contents', lg: 'flex' }, flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <Box sx={{ order: 2, minWidth: 0 }}>
                <OperationProgress operation={latestOperation} />
              </Box>
              <Box sx={{ order: 3, minWidth: 0 }}>
                <Lwm2mControls
                  vehicleId={id}
                  resources={lwm2m.data?.resources ?? []}
                  canManage={session?.user.role === 'ADMIN'}
                  registered={Boolean(lwm2m.data?.registered)}
                  pending={hasPending}
                  onUpdated={async () => { await Promise.all([lwm2m.refetch(), operations.refetch()]); }}
                />
              </Box>
            </Box>
          </Box>
        )}
        {tab === 'operations' && (
          <Box>
            <OperationProgress operation={latestOperation} />
            <SectionCard sx={{ mt: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2.25 }}><Typography sx={{ fontWeight: 600 }}>Historial de operaciones</Typography><Typography variant="caption" color="text.secondary">Últimos 100 comandos sincronizados desde el Bridge</Typography></Box>
              <Divider />
              <TableContainer>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Transacción</TableCell><TableCell>Recurso</TableCell><TableCell>Valor</TableCell><TableCell>Estado</TableCell><TableCell>Actualización</TableCell></TableRow></TableHead>
                  <TableBody>
                    {(operations.data ?? []).map((operation) => (
                      <TableRow key={operation.id} hover>
                        <TableCell>#{operation.transactionId}</TableCell>
                        <TableCell><Typography variant="caption" className="mono">{operation.resourcePath}</Typography></TableCell>
                        <TableCell>{String(operation.requestedValue)}</TableCell>
                        <TableCell><Chip size="small" label={operationStatusLabel(operation.status)} color={operation.status === 'acknowledged' ? 'success' : operation.status.includes('failed') || operation.status === 'rejected' || operation.status === 'timed_out' ? 'error' : 'default'} variant="outlined" /></TableCell>
                        <TableCell>{formatDateTime(operation.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                    {(operations.data?.length ?? 0) === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 5 }}>No existen operaciones registradas.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </TableContainer>
            </SectionCard>
          </Box>
        )}
      </Box>

      {(latest.isError || lwm2m.isError || operations.isError) && (
        <Alert severity="warning" icon={<ShieldAlert size={19} />} sx={{ mt: 2 }}>
          Algunos datos operativos no están disponibles. {latest.isError ? apiErrorMessage(latest.error) : lwm2m.isError ? apiErrorMessage(lwm2m.error) : apiErrorMessage(operations.error)}
        </Alert>
      )}
    </Box>
  );
}
