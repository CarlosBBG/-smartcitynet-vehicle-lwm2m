import {
  Avatar,
  Badge,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { Bell, ChevronDown, LogOut, Menu as MenuIcon } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { useAlerts } from '../../hooks/use-alerts';
import { tokens } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';

const pageLabels: Record<string, { group: string; title: string }> = {
  '/': { group: 'Administración', title: 'Dashboard' },
  '/vehicles': { group: 'Administración', title: 'Vehículos' },
  '/map': { group: 'Operación', title: 'Mapa' },
  '/alerts': { group: 'Operación', title: 'Alertas' },
  '/users': { group: 'Administración', title: 'Usuarios' },
};

export function AppHeader({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const location = useLocation();
  const { session, logout } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null);
  const alerts = useAlerts({ active: 'true', limit: 5 });
  const labels = pageLabels[location.pathname] ?? {
    group: 'SmartCityNet',
    title: 'Detalle',
  };

  const openMenu = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);

  return (
    <Box
      component="header"
      sx={{
        height: tokens.shell.headerHeight,
        px: { xs: 2, md: 3.5 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <IconButton
          onClick={onOpenNavigation}
          aria-label="Abrir navegación"
          sx={{ display: { md: 'none' }, mr: 1 }}
        >
          <MenuIcon size={19} />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
          {labels.group}
        </Typography>
        <Typography color="divider" sx={{ mx: 1.25, display: { xs: 'none', sm: 'block' } }}>
          /
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {labels.title}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            gap: 0.8,
            mr: 1,
            px: 1.25,
            py: 0.65,
            borderRadius: 2,
            bgcolor: 'rgba(23,25,39,.04)',
          }}
        >
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'success.main' }} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            Sesión activa
          </Typography>
        </Box>
        <IconButton
          aria-label="Abrir notificaciones"
          onClick={(event) => setNotificationAnchor(event.currentTarget)}
        >
          <Badge
            color="error"
            badgeContent={alerts.data?.summary.active ?? 0}
            max={99}
          >
            <Bell size={18} />
          </Badge>
        </IconButton>
        <Box
          component="button"
          onClick={openMenu}
          aria-label="Abrir menú de usuario"
          sx={{
            border: 0,
            bgcolor: 'transparent',
            p: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderRadius: 1.5,
            cursor: 'pointer',
          }}
        >
          <Avatar sx={{ width: 32, height: 32, bgcolor: tokens.color.purpleSoft, color: tokens.color.purple, fontSize: 13, fontWeight: 700 }}>
            {session?.user.name.slice(0, 2).toUpperCase()}
          </Avatar>
          <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'left' }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
              {session?.user.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {session?.user.role === 'ADMIN' ? 'Administrador' : 'Consulta'}
            </Typography>
          </Box>
          <ChevronDown size={15} />
        </Box>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          <MenuItem
            onClick={() => {
              setAnchor(null);
              logout();
            }}
          >
            <LogOut size={16} style={{ marginRight: 10 }} />
            Cerrar sesión
          </MenuItem>
        </Menu>
        <Menu
          anchorEl={notificationAnchor}
          open={Boolean(notificationAnchor)}
          onClose={() => setNotificationAnchor(null)}
          slotProps={{ paper: { sx: { width: 350, maxWidth: 'calc(100vw - 24px)', mt: 1 } } }}
        >
          <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Notificaciones</Typography>
            <Typography variant="caption" color="text.secondary">{alerts.data?.summary.active ?? 0} activas</Typography>
          </Box>
          <Divider />
          {(alerts.data?.items.length ?? 0) === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2.5 }}>
              No hay alertas activas.
            </Typography>
          ) : (
            alerts.data?.items.map((alert) => (
              <MenuItem
                key={alert.id}
                component={Link}
                to="/alerts"
                onClick={() => setNotificationAnchor(null)}
                sx={{ alignItems: 'flex-start', gap: 1.25, py: 1.25, whiteSpace: 'normal' }}
              >
                <Box sx={{ mt: 0.65, width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto', bgcolor: alert.severity === 'CRITICAL' ? 'error.main' : alert.severity === 'WARNING' ? 'warning.main' : 'secondary.main' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{alert.title}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{alert.vehicle?.name ?? 'Sistema'} · {formatRelativeTime(alert.createdAt)}</Typography>
                </Box>
              </MenuItem>
            ))
          )}
          <Divider />
          <MenuItem component={Link} to="/alerts" onClick={() => setNotificationAnchor(null)} sx={{ justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
            Ver todas las alertas
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
}
