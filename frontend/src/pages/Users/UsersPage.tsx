import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../components/ui/QueryState';
import { SectionCard } from '../../components/ui/SectionCard';
import { UserDialog } from '../../components/users/UserDialog';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../services/api';
import { createUser, disableUser, getUsers, updateUser } from '../../services/users.service';
import type { CreateUserInput, User } from '../../types/user';
import { formatDateTime } from '../../utils/format';

const usersKey = ['users'] as const;

export function UsersPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: usersKey, queryFn: getUsers });
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (input: CreateUserInput) => editing
      ? updateUser(editing.id, {
          name: input.name,
          email: input.email,
          role: input.role,
          ...(input.password ? { password: input.password } : {}),
        })
      : createUser(input),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: usersKey });
      setDialogOpen(false);
      setEditing(null);
      setNotice(editing ? 'Cambios guardados.' : `${user.name} puede ingresar al sistema.`);
    },
    onError: (error) => setDialogError(apiErrorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: (user: User) => user.enabled
      ? disableUser(user.id)
      : updateUser(user.id, { enabled: true }),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: usersKey });
      setConfirmDisable(null);
      setNotice(user.enabled ? 'Usuario activado.' : 'Usuario desactivado.');
    },
    onError: (error) => setNotice(apiErrorMessage(error)),
  });

  const term = search.trim().toLowerCase();
  const filtered = (usersQuery.data ?? []).filter((user) =>
    !term || [user.name, user.email, user.role].some((value) => value.toLowerCase().includes(term)),
  );

  const openCreate = () => {
    setEditing(null);
    setDialogError(null);
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setDialogError(null);
    setDialogOpen(true);
  };

  if (usersQuery.isPending) return <LoadingState label="Cargando usuarios" />;
  if (usersQuery.isError) return <Box sx={{ p: 3 }}><ErrorState message={apiErrorMessage(usersQuery.error)} /></Box>;

  return (
    <Box sx={{ p: { xs: 2, sm: 3.5 } }}>
      <PageHeader
        eyebrow="Acceso"
        title="Usuarios"
        description="Cuentas que pueden consultar los vehículos o administrar vehículos y comandos."
        action={{ label: 'Crear usuario', icon: Plus, onClick: openCreate }}
      />

      <SectionCard sx={{ mt: 3 }}>
        <Box sx={{ px: 2.25, py: 1.75, display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Accesos registrados</Typography>
            <Typography variant="caption" color="text.secondary">{filtered.length} de {usersQuery.data?.length ?? 0} usuarios</Typography>
          </Box>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar usuario"
            aria-label="Buscar usuario"
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> } }}
            sx={{ minWidth: { sm: 240 } }}
          />
        </Box>
        <Divider />

        {filtered.length === 0 ? (
          <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
            <Box>
              <Typography sx={{ fontWeight: 600 }}>No se encontraron usuarios</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Cambie la búsqueda o cree una cuenta.</Typography>
            </Box>
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 620 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Usuario</TableCell>
                  <TableCell>Rol</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Creado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((user) => {
                  const isCurrentUser = user.id === session?.user.id;
                  return (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{user.name}{isCurrentUser ? ' · Tú' : ''}</Typography>
                        <Typography variant="caption" color="text.secondary">{user.email}</Typography>
                      </TableCell>
                      <TableCell>{user.role === 'ADMIN' ? 'Administrador' : 'Consulta'}</TableCell>
                      <TableCell><Chip size="small" label={user.enabled ? 'Activo' : 'Desactivado'} color={user.enabled ? 'success' : 'default'} variant="outlined" /></TableCell>
                      <TableCell>{formatDateTime(user.createdAt)}</TableCell>
                      <TableCell align="right">
                        {!isCurrentUser ? (
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Button size="small" color="inherit" onClick={() => openEdit(user)}>Editar</Button>
                            <Button size="small" color={user.enabled ? 'error' : 'primary'} onClick={() => user.enabled ? setConfirmDisable(user) : toggleMutation.mutate(user)} disabled={toggleMutation.isPending}>
                              {user.enabled ? 'Desactivar' : 'Activar'}
                            </Button>
                          </Box>
                        ) : <Typography variant="caption" color="text.secondary">Sesión actual</Typography>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      <UserDialog
        key={`${editing?.id ?? 'new'}-${dialogOpen}`}
        open={dialogOpen}
        user={editing}
        pending={saveMutation.isPending}
        error={dialogError}
        onClose={() => setDialogOpen(false)}
        onSave={(input) => saveMutation.mutateAsync(input).then(() => undefined)}
      />
      <Dialog open={Boolean(confirmDisable)} onClose={() => setConfirmDisable(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Desactivar usuario</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{confirmDisable?.name} no podrá ingresar hasta que vuelva a activarlo.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setConfirmDisable(null)}>Cancelar</Button>
          <Button color="error" variant="contained" disabled={toggleMutation.isPending} onClick={() => confirmDisable && toggleMutation.mutate(confirmDisable)}>Desactivar</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice} />
    </Box>
  );
}
