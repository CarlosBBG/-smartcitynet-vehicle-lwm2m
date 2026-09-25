import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import { useState, type FormEvent } from 'react';

import type { UserRole } from '../../types/auth';
import type { CreateUserInput, User } from '../../types/user';

interface UserDialogProps {
  open: boolean;
  user: User | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: CreateUserInput) => Promise<void>;
}

export function UserDialog({ open, user, pending, error, onClose, onSave }: UserDialogProps) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'VIEWER');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSave({ name: name.trim(), email: email.trim().toLowerCase(), role, password }).catch(() => undefined);
  };

  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{user ? 'Editar usuario' : 'Crear usuario'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <form id="user-form" onSubmit={submit}>
          <TextField label="Nombre" value={name} onChange={(event) => setName(event.target.value)} required fullWidth margin="normal" autoFocus />
          <TextField label="Correo electrónico" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required fullWidth margin="normal" />
          <TextField select label="Rol" value={role} onChange={(event) => {
            if (event.target.value === 'ADMIN' || event.target.value === 'VIEWER') setRole(event.target.value);
          }} fullWidth margin="normal">
            <MenuItem value="VIEWER">Consulta · solo lectura</MenuItem>
            <MenuItem value="ADMIN">Administrador · gestión completa</MenuItem>
          </TextField>
          <TextField
            label={user ? 'Nueva contraseña (opcional)' : 'Contraseña'}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required={!user}
            slotProps={{ htmlInput: { minLength: 12 } }}
            helperText="Mínimo 12 caracteres. Déjela vacía al editar para conservar la actual."
            fullWidth
            margin="normal"
          />
        </form>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending} color="inherit">Cancelar</Button>
        <Button type="submit" form="user-form" variant="contained" disabled={pending}>
          {user ? 'Guardar cambios' : 'Crear usuario'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
