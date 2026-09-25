import {
  Box,
  ButtonBase,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import {
  Bell,
  CarFront,
  LayoutDashboard,
  Map,
  RadioTower,
  Users,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { tokens } from '../../theme/tokens';

const navigation = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Vehículos', path: '/vehicles', icon: CarFront },
  { label: 'Mapa', path: '/map', icon: Map },
  { label: 'Alertas', path: '/alerts', icon: Bell },
  { label: 'Usuarios', path: '/users', icon: Users },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { session } = useAuth();
  const visibleNavigation = navigation.filter(
    ({ path }) => path !== '/users' || session?.user.role === 'ADMIN',
  );
  return (
    <Box
      component="aside"
      sx={{
        width: tokens.shell.sidebarWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ height: 68, px: 2, display: 'flex', alignItems: 'center' }}>
        <ButtonBase
          component={NavLink}
          to="/"
          onClick={onNavigate}
          aria-label="Ir al dashboard"
          sx={{ borderRadius: 1.5, textAlign: 'left' }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 1.25,
              bgcolor: tokens.color.ink,
              color: '#fff',
            }}
          >
            <RadioTower size={18} />
          </Box>
          <Box sx={{ ml: 1.25 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>
              SmartCityNet
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Gestión de los vehículos
            </Typography>
          </Box>
        </ButtonBase>
      </Box>
      <Divider />
      <Box sx={{ px: 1.25, pt: 2.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 1.25, textTransform: 'uppercase', letterSpacing: '.09em' }}
        >
          Operación
        </Typography>
        <List sx={{ mt: 1, p: 0 }}>
          {visibleNavigation.map(({ label, path, icon: Icon }) => (
            <ListItem disablePadding key={path} sx={{ mb: 0.5 }}>
              <ListItemButton
                component={NavLink}
                to={path}
                onClick={onNavigate}
                sx={{
                  minHeight: 42,
                  borderRadius: 1.25,
                  color: 'text.secondary',
                  '&.active': {
                    color: 'text.primary',
                    bgcolor: 'rgba(23,25,39,.055)',
                    '& .MuiListItemIcon-root': { color: 'text.primary' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary' }}>
                  <Icon size={17} />
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  slotProps={{ primary: { sx: { fontSize: 13, fontWeight: 500 } } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
      <Box sx={{ mt: 'auto', p: 2 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: tokens.color.blueSoft,
            display: 'flex',
            gap: 1.25,
            alignItems: 'center',
          }}
        >
          <RadioTower size={17} color={tokens.color.blue} />
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
              Ruta LwM2M
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Leshan + TTN
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
