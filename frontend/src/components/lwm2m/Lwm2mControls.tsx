import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Snackbar,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { AlarmClock, Lightbulb, Siren } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  setLight,
  setRemoteAlert,
  setTransmissionInterval,
  type LightName,
} from '../../services/vehicles.service';
import type { Lwm2mResource } from '../../types/vehicle';
import { apiErrorMessage } from '../../services/api';
import { SectionCard } from '../ui/SectionCard';

interface Lwm2mControlsProps {
  vehicleId: string;
  resources: Lwm2mResource[];
  canManage: boolean;
  registered: boolean;
  pending: boolean;
  onUpdated: () => Promise<void>;
  showInterval?: boolean;
  compact?: boolean;
}

interface PendingCommand {
  title: string;
  description: string;
  execute: () => Promise<unknown>;
}

const lightControls: Array<{ id: number; key: LightName; label: string }> = [
  { id: 23, key: 'front', label: 'Luz frontal' },
  { id: 24, key: 'rear', label: 'Luz trasera' },
  { id: 25, key: 'parking', label: 'Parqueo' },
  { id: 32, key: 'left', label: 'Direccional izquierda' },
  { id: 33, key: 'right', label: 'Direccional derecha' },
];

function boolValue(resource: Lwm2mResource | undefined): boolean {
  return resource?.value === true || resource?.value === 1 || resource?.value === 'true';
}

export function Lwm2mControls({
  vehicleId,
  resources,
  canManage,
  registered,
  pending,
  onUpdated,
  showInterval = true,
  compact = false,
}: Lwm2mControlsProps) {
  const intervalResource = resources.find((resource) => resource.id === 0);
  const [intervalDraft, setIntervalDraft] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<PendingCommand | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const disabled = !canManage || !registered || pending;

  const interval = intervalDraft ?? (typeof intervalResource?.value === 'number' ? intervalResource.value : 30);

  const mutation = useMutation({
    mutationFn: async (command: PendingCommand) => command.execute(),
    onSuccess: async () => {
      setConfirmation(null);
      setIntervalDraft(null);
      setNotice('Comando aceptado. Esperando confirmación del vehículo.');
      await onUpdated();
    },
    onError: (error) => {
      setConfirmation(null);
      setNotice(apiErrorMessage(error));
    },
  });

  const reason = useMemo(() => {
    if (!canManage) return 'Su cuenta es de consulta. Solo un administrador puede enviar comandos.';
    if (!registered) return 'El cliente LwM2M no está registrado en Leshan.';
    if (pending) return 'Hay un comando en curso. Espere su confirmación antes de enviar otro.';
    return null;
  }, [canManage, pending, registered]);

  const confirmLight = (id: number, light: LightName, label: string) => {
    const current = boolValue(resources.find((resource) => resource.id === id));
    const next = !current;
    setConfirmation({
      title: `${next ? 'Encender' : 'Apagar'} ${label.toLowerCase()}`,
      description: `Se enviará el cambio al vehículo mediante Leshan, Bridge, TTN y LoRaWAN.`,
      execute: () => setLight(vehicleId, light, next),
    });
  };

  const confirmAlert = () => {
    const current = boolValue(resources.find((resource) => resource.id === 11));
    const next = !current;
    setConfirmation({
      title: `${next ? 'Activar' : 'Desactivar'} alerta remota`,
      description: 'Esta acción cambia el bloqueo remoto de motores del vehículo.',
      execute: () => setRemoteAlert(vehicleId, next),
    });
  };

  const confirmInterval = () => {
    setConfirmation({
      title: 'Cambiar frecuencia de telemetría',
      description: `El vehículo transmitirá cada ${interval} segundos. El rango permitido es de 15 a 86400 segundos.`,
      execute: () => setTransmissionInterval(vehicleId, interval),
    });
  };

  return (
    <>
      {showInterval && <SectionCard sx={{ p: { xs: 2, sm: 2.25 }, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlarmClock size={18} />
          <Typography sx={{ fontWeight: 600 }}>Frecuencia de telemetría</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'start', gap: 1, mt: 2 }}>
          <TextField
            label="Intervalo"
            type="number"
            value={interval}
            onChange={(event) => setIntervalDraft(Number(event.target.value))}
            slotProps={{ htmlInput: { min: 15, max: 86400 } }}
            disabled={disabled || mutation.isPending}
            helperText="15 segundos a 24 horas"
            fullWidth
            sx={{ minWidth: 0 }}
          />
          <Button
            variant="contained"
            aria-label="Aplicar intervalo"
            onClick={confirmInterval}
            disabled={disabled || mutation.isPending || interval < 15 || interval > 86_400}
            sx={{ height: 40, minHeight: 40, alignSelf: 'start' }}
          >
            Aplicar
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          La pantalla consulta datos y operaciones cada 5 segundos. Este valor no cambia la frecuencia de envío LoRaWAN del vehículo.
        </Typography>
      </SectionCard>}

      <SectionCard sx={{ p: { xs: 2, sm: 2.25 }, mt: showInterval ? 2 : 0, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Lightbulb size={18} />
          <Typography sx={{ fontWeight: 600 }}>Iluminación</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.5, mt: 1.25 }}>
          {lightControls.map((control) => {
            const resource = resources.find((item) => item.id === control.id);
            return (
              <FormControlLabel
                key={control.key}
                label={control.label}
                control={
                  <Switch
                    checked={boolValue(resource)}
                    onChange={() => confirmLight(control.id, control.key, control.label)}
                    disabled={disabled || mutation.isPending || !resource?.available}
                  />
                }
                sx={{ m: 0, py: 0.5, width: '100%', minWidth: 0, justifyContent: 'space-between', flexDirection: 'row-reverse', '& .MuiFormControlLabel-label': { minWidth: 0, overflowWrap: 'anywhere' }, '& .MuiSwitch-root': { flexShrink: 0 } }}
              />
            );
          })}
        </Box>
      </SectionCard>

      <SectionCard sx={{ p: { xs: 2, sm: 2.25 }, mt: 2, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Siren size={18} />
          <Typography sx={{ fontWeight: 600 }}>Seguridad</Typography>
        </Box>
        <FormControlLabel
          label="Alerta remota y bloqueo de motores"
          control={
            <Switch
              checked={boolValue(resources.find((resource) => resource.id === 11))}
              onChange={confirmAlert}
              disabled={disabled || mutation.isPending || !resources.find((resource) => resource.id === 11)?.available}
              color="error"
            />
          }
          sx={{ m: 0, mt: 1.25, width: '100%', minWidth: 0, justifyContent: 'space-between', flexDirection: 'row-reverse', '& .MuiFormControlLabel-label': { minWidth: 0, overflowWrap: 'anywhere' }, '& .MuiSwitch-root': { flexShrink: 0 } }}
        />
      </SectionCard>

      {reason && <Alert severity="info" sx={{ mt: 2 }}>{reason}</Alert>}

      <Dialog open={Boolean(confirmation)} onClose={() => !mutation.isPending && setConfirmation(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{confirmation?.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">{confirmation?.description}</Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmation(null)} disabled={mutation.isPending}>Cancelar</Button>
          <Button variant="contained" onClick={() => confirmation && mutation.mutate(confirmation)} disabled={mutation.isPending}>
            {mutation.isPending ? 'Enviando…' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice(null)} message={notice} />
    </>
  );
}
