import { Box, Drawer } from '@mui/material';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { tokens } from '../../theme/tokens';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box
      sx={{
        height: '100dvh',
        overflow: 'hidden',
        p: { xs: 0, lg: 1.5 },
      }}
    >
      <Box
        sx={{
          height: '100%',
          maxWidth: 1800,
          mx: 'auto',
          bgcolor: 'background.paper',
          border: { xs: 0, lg: '1px solid' },
          borderColor: 'divider',
          borderRadius: { xs: 0, lg: 3 },
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: `${tokens.shell.sidebarWidth}px minmax(0, 1fr)` },
          gridTemplateRows: 'minmax(0, 1fr)',
        }}
      >
        <Box
          sx={{
            display: { xs: 'none', md: 'block' },
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            borderRight: '1px solid',
            borderColor: 'divider',
          }}
        >
          <AppSidebar />
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: `${tokens.shell.headerHeight}px minmax(0, 1fr)` }}>
          <AppHeader onOpenNavigation={() => setMobileOpen(true)} />
          <Box component="main" sx={{ minWidth: 0, minHeight: 0, bgcolor: '#fbfcfd', overflowX: 'hidden', overflowY: 'auto', overscrollBehaviorY: 'contain' }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <AppSidebar onNavigate={() => setMobileOpen(false)} />
      </Drawer>
    </Box>
  );
}
