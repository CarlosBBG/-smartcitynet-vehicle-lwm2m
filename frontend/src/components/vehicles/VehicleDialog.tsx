import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { type FormEvent, useState } from 'react';

import type { Vehicle, VehicleInput } from '../../types/vehicle';

interface VehicleDialogProps {
  open: boolean;
  vehicle: Vehicle | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: VehicleInput) => Promise<void>;
}

const emptyForm: VehicleInput = {
  name: '',
  deviceId: '',
  devEui: '',
  model: 'Heltec WiFi LoRa 32 V3',
  description: '',
  enabled: true,
};

function formFromVehicle(vehicle: Vehicle | null): VehicleInput {
  return vehicle
    ? {
        name: vehicle.name,
        deviceId: vehicle.deviceId,
        devEui: vehicle.devEui ?? '',
        model: vehicle.model,
        description: vehicle.description ?? '',
        enabled: vehicle.enabled,
      }
    : emptyForm;
}

type VehicleDialogContentProps = Omit<VehicleDialogProps, 'open'>;

function VehicleDialogContent({
  vehicle,
  pending,
  error,
  onClose,
  onSave,
}: VehicleDialogContentProps) {
  const [form, setForm] = useState<VehicleInput>(() => formFromVehicle(vehicle));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave({
      ...form,
      devEui: form.devEui?.trim() || undefined,
      description: form.description?.trim() || undefined,
    });
  };

  return (
    <Dialog open onClose={pending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{vehicle ? 'Editar vehículo' : 'Registrar vehículo'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          El dispositivo debe estar provisionado previamente en TTN. Si todavía no ha enviado datos, quedará en estado “Esperando primer uplink”.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <form id="vehicle-form" onSubmit={submit}>
          <TextField
            label="Nombre"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
            fullWidth
            autoFocus
            sx={{ mb: 2 }}
          />
          <TextField
            label="TTN Device ID"
            value={form.deviceId}
            onChange={(event) => setForm({ ...form, deviceId: event.target.value.toLowerCase() })}
            required
            disabled={Boolean(vehicle)}
            helperText={vehicle ? 'El Device ID no puede cambiarse después del registro.' : 'Use exactamente el identificador configurado en TTN.'}
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="DevEUI"
            value={form.devEui}
            onChange={(event) => setForm({ ...form, devEui: event.target.value.toUpperCase().replace(/[^0-9A-F]/g, '') })}
            slotProps={{ htmlInput: { maxLength: 16 } }}
            helperText="16 caracteres hexadecimales; opcional."
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Modelo"
            value={form.model}
            onChange={(event) => setForm({ ...form, model: event.target.value })}
            required
            fullWidth
            sx={{ mb: 2 }}
          />
          <TextField
            label="Descripción"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            multiline
            minRows={3}
            fullWidth
          />
          {vehicle && (
            <FormControlLabel
              sx={{ mt: 1.5 }}
              control={
                <Switch
                  checked={Boolean(form.enabled)}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
              }
              label="Vehículo habilitado"
            />
          )}
        </form>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, pt: 1 }}>
        <Button onClick={onClose} disabled={pending} color="inherit">Cancelar</Button>
        <Button type="submit" form="vehicle-form" variant="contained" disabled={pending}>
          {pending ? 'Guardando…' : vehicle ? 'Guardar cambios' : 'Registrar vehículo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function VehicleDialog({ open, ...props }: VehicleDialogProps) {
  if (!open) return null;

  return (
    <VehicleDialogContent
      key={props.vehicle?.id ?? 'new-vehicle'}
      {...props}
    />
  );
}
