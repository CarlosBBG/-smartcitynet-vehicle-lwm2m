import { Alert, Box, Chip, LinearProgress, Typography } from '@mui/material';
import { Check, CloudUpload, Radio, Router, Server } from 'lucide-react';

import type { Operation, OperationStatus } from '../../types/vehicle';
import { formatDateTime } from '../../utils/format';
import { SectionCard } from '../ui/SectionCard';

const stages: Array<{ status: OperationStatus; label: string; icon: typeof Check }> = [
  { status: 'requested', label: 'Solicitado', icon: CloudUpload },
  { status: 'published', label: 'Bridge', icon: Server },
  { status: 'ttn_queued', label: 'Cola TTN', icon: Router },
  { status: 'ttn_sent', label: 'LoRaWAN', icon: Radio },
  { status: 'acknowledged', label: 'Confirmado', icon: Check },
];

const failureStatuses: OperationStatus[] = [
  'rejected',
  'timed_out',
  'ttn_failed',
  'publish_failed',
];

export const pendingStatuses: OperationStatus[] = [
  'requested',
  'published',
  'ttn_queued',
  'ttn_sent',
  'lorawan_acknowledged',
];

function stageIndex(status: OperationStatus): number {
  if (status === 'lorawan_acknowledged') return 3;
  if (status === 'acknowledged') return 4;
  return Math.max(0, stages.findIndex((stage) => stage.status === status));
}

export function operationStatusLabel(status: OperationStatus): string {
  const labels: Record<OperationStatus, string> = {
    requested: 'Solicitado',
    published: 'Publicado en el Bridge',
    ttn_queued: 'En cola de TTN',
    ttn_sent: 'Enviado por LoRaWAN',
    lorawan_acknowledged: 'Recibido por la Heltec',
    acknowledged: 'Aplicado y confirmado',
    rejected: 'Rechazado',
    timed_out: 'Tiempo agotado',
    ttn_failed: 'Falló la entrega LoRaWAN',
    publish_failed: 'Falló la publicación',
  };
  return labels[status];
}

export function OperationProgress({ operation }: { operation: Operation | null }) {
  if (!operation) {
    return (
      <SectionCard sx={{ p: 2.25 }}>
        <Typography sx={{ fontWeight: 600 }}>Seguimiento del comando</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Todavía no se han registrado operaciones para este vehículo.
        </Typography>
      </SectionCard>
    );
  }

  const failed = failureStatuses.includes(operation.status);
  const activeIndex = stageIndex(operation.status);

  return (
    <SectionCard sx={{ p: { xs: 2, sm: 2.25 }, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>Seguimiento del comando</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            Transacción #{operation.transactionId} · {operation.resourcePath}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={operationStatusLabel(operation.status)}
          color={failed ? 'error' : operation.status === 'acknowledged' ? 'success' : 'default'}
          variant="outlined"
        />
      </Box>

      {pendingStatuses.includes(operation.status) && <LinearProgress sx={{ mt: 2 }} />}
      {failed && (
        <Alert severity="error" sx={{ mt: 2 }}>
          El comando no llegó a confirmarse. Revise TTN, el Bridge y la conectividad del vehículo antes de reintentar.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(5, 1fr)' }, gap: 1, mt: 2.25 }}>
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const complete = !failed && index <= activeIndex;
          return (
            <Box key={stage.status} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: complete ? 'text.primary' : 'text.secondary' }}>
              <Box sx={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: complete ? '#e3f8f2' : '#f0f2f5', color: complete ? '#16735f' : '#8a909d' }}>
                <Icon size={14} />
              </Box>
              <Typography variant="caption" sx={{ fontWeight: complete ? 600 : 400 }}>{stage.label}</Typography>
            </Box>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Actualizado {formatDateTime(operation.updatedAt)}
      </Typography>
    </SectionCard>
  );
}
