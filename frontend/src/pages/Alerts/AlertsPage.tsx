import {
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Snackbar,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BatteryLow,
  BellRing,
  CheckCheck,
  CircleCheck,
  Info,
  RadioTower,
  ShieldAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../components/ui/QueryState';
import { SectionCard } from '../../components/ui/SectionCard';
import { useAuth } from '../../context/AuthContext';
import { alertKeys, useAlerts } from '../../hooks/use-alerts';
import { acknowledgeAlert } from '../../services/alerts.service';
import { apiErrorMessage } from '../../services/api';
import { tokens } from '../../theme/tokens';
import type {
  AlertSeverity,
  AlertsQuery,
  AlertType,
  VehicleAlert,
} from '../../types/alert';
import { formatDateTime, formatRelativeTime } from '../../utils/format';

type StatusFilter = 'active' | 'resolved' | 'all';

const typeConfig: Record<AlertType, { label: string; icon: LucideIcon }> = {
  LOCAL_PANIC: { label: 'Pánico local', icon: ShieldAlert },
  LOW_BATTERY: { label: 'Batería baja', icon: BatteryLow },
  VEHICLE_OFFLINE: { label: 'Sin conexión', icon: WifiOff },
  LWM2M_DISCONNECTED: { label: 'LwM2M desconectado', icon: RadioTower },
  SYSTEM: { label: 'Sistema', icon: Info },
};

const severityConfig: Record<AlertSeverity, { label: string; color: string; soft: string }> = {
  CRITICAL: { label: 'Crítica', color: '#b83c4a', soft: '#ffeaed' },
  WARNING: { label: 'Advertencia', color: '#9b6611', soft: '#fff4dc' },
  INFO: { label: 'Informativa', color: '#426cae', soft: '#e6f1fd' },
};

function isStatusFilter(value: string): value is StatusFilter {
  return value === 'active' || value === 'resolved' || value === 'all';
}

function isAlertSeverity(value: string): value is AlertSeverity {
  return value === 'INFO' || value === 'WARNING' || value === 'CRITICAL';
}

function isAlertType(value: string): value is AlertType {
  return Object.hasOwn(typeConfig, value);
}

function AlertMetric({ label, value, icon: Icon, color, tint }: { label: string; value: number; icon: LucideIcon; color: string; tint: string }) {
  return (
    <SectionCard sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: tint, color }}><Icon size={18} /></Box>
      <Box><Typography sx={{ fontSize: 24, lineHeight: 1, fontWeight: 600 }}>{value}</Typography><Typography variant="caption" color="text.secondary">{label}</Typography></Box>
    </SectionCard>
  );
}

function AlertRow({ alert, last, canAcknowledge, pending, onAcknowledge }: { alert: VehicleAlert; last: boolean; canAcknowledge: boolean; pending: boolean; onAcknowledge: () => void }) {
  const severity = severityConfig[alert.severity];
  const type = typeConfig[alert.type];
  const Icon = type.icon;
  return (
    <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', gap: 1.5, px: { xs: 1.5, sm: 2.25 }, py: 1.75 }}>
      {!last && <Box aria-hidden="true" sx={{ position: 'absolute', left: { xs: 29, sm: 41 }, top: 44, bottom: -14, width: '1px', bgcolor: 'divider' }} />}
      <Box sx={{ mt: 0.25, width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: severity.soft, color: severity.color, zIndex: 1 }}><Icon size={15} /></Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 600 }}>{alert.title}</Typography>
              <Chip size="small" label={severity.label} sx={{ height: 23, bgcolor: severity.soft, color: severity.color, fontWeight: 600 }} />
              {!alert.active && <Chip size="small" label="Resuelta" variant="outlined" sx={{ height: 23 }} />}
              {alert.acknowledged && <Chip size="small" icon={<CheckCheck size={13} />} label="Reconocida" color="success" variant="outlined" sx={{ height: 23 }} />}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{alert.message}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.8 }}>
              {alert.vehicle?.name ?? 'Sistema'} · {type.label} · {formatRelativeTime(alert.createdAt)}
            </Typography>
          </Box>
          {canAcknowledge && alert.active && !alert.acknowledged && (
            <Button size="small" variant="outlined" onClick={onAcknowledge} disabled={pending} startIcon={<CircleCheck size={15} />}>Reconocer</Button>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Creada: {formatDateTime(alert.createdAt)}{alert.resolvedAt ? ` · Resuelta: ${formatDateTime(alert.resolvedAt)}` : ''}
        </Typography>
      </Box>
    </Box>
  );
}

export function AlertsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('active');
  const [severity, setSeverity] = useState<'' | AlertSeverity>('');
  const [type, setType] = useState<'' | AlertType>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useMemo<AlertsQuery>(() => ({
    ...(status === 'all' ? {} : { active: status === 'active' ? 'true' : 'false' }),
    ...(severity ? { severity } : {}),
    ...(type ? { type } : {}),
    page: page + 1,
    limit: rowsPerPage,
  }), [page, rowsPerPage, severity, status, type]);
  const alerts = useAlerts(query);
  const acknowledge = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: alertKeys.all });
      setNotice('Alerta reconocida.');
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  if (alerts.isPending) return <LoadingState label="Cargando alertas" />;
  if (alerts.isError) return <Box sx={{ p: 3 }}><ErrorState message={apiErrorMessage(alerts.error)} /></Box>;

  const summary = alerts.data?.summary ?? { active: 0, critical: 0, warning: 0, acknowledged: 0 };
  const items = alerts.data?.items ?? [];

  return (
    <Box sx={{ p: { xs: 2, sm: 3.5 } }}>
      <PageHeader eyebrow="Supervisión" title="Alertas" description="Incidentes generados automáticamente a partir de telemetría y conectividad de los vehículos." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2, mt: 3 }}>
        <AlertMetric label="Activas" value={summary.active} icon={BellRing} color={tokens.color.coral} tint={tokens.color.coralSoft} />
        <AlertMetric label="Críticas" value={summary.critical} icon={ShieldAlert} color="#b83c4a" tint="#ffeaed" />
        <AlertMetric label="Advertencias" value={summary.warning} icon={AlertTriangle} color={tokens.color.amber} tint="#fff4dc" />
        <AlertMetric label="Reconocidas" value={summary.acknowledged} icon={CheckCheck} color="#16735f" tint={tokens.color.mintSoft} />
      </Box>

      <SectionCard sx={{ mt: 2.25, overflow: 'hidden' }}>
        <Box sx={{ px: 2.25, py: 1.75, display: 'flex', alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5 }}>
          <Box><Typography variant="body2" sx={{ fontWeight: 600 }}>Línea de incidentes</Typography><Typography variant="caption" color="text.secondary">{alerts.data?.total ?? 0} resultados</Typography></Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(150px, 1fr))' }, gap: 1 }}>
            <TextField select label="Estado" value={status} onChange={(event) => { if (isStatusFilter(event.target.value)) setStatus(event.target.value); setPage(0); }}>
              <MenuItem value="active">Activas</MenuItem><MenuItem value="resolved">Resueltas</MenuItem><MenuItem value="all">Todas</MenuItem>
            </TextField>
            <TextField select label="Severidad" value={severity} onChange={(event) => { const value = event.target.value; if (value === '' || isAlertSeverity(value)) setSeverity(value); setPage(0); }}>
              <MenuItem value="">Todas</MenuItem><MenuItem value="CRITICAL">Crítica</MenuItem><MenuItem value="WARNING">Advertencia</MenuItem><MenuItem value="INFO">Informativa</MenuItem>
            </TextField>
            <TextField select label="Tipo" value={type} onChange={(event) => { const value = event.target.value; if (value === '' || isAlertType(value)) setType(value); setPage(0); }}>
              <MenuItem value="">Todos</MenuItem>{Object.entries(typeConfig).map(([value, config]) => <MenuItem key={value} value={value}>{config.label}</MenuItem>)}
            </TextField>
          </Box>
        </Box>
        <Divider />
        {items.length === 0 ? (
          <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}><Box><CircleCheck size={26} color={tokens.color.mint} /><Typography sx={{ mt: 1, fontWeight: 600 }}>No hay alertas para estos filtros</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Las nuevas condiciones aparecerán aquí en tiempo real.</Typography></Box></Box>
        ) : items.map((alert, index) => <AlertRow key={alert.id} alert={alert} last={index === items.length - 1} canAcknowledge={session?.user.role === 'ADMIN'} pending={acknowledge.isPending && acknowledge.variables === alert.id} onAcknowledge={() => acknowledge.mutate(alert.id)} />)}
        <Divider />
        <TablePagination component="div" count={alerts.data?.total ?? 0} page={page} rowsPerPage={rowsPerPage} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Alertas por página" />
      </SectionCard>
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice} />
    </Box>
  );
}
