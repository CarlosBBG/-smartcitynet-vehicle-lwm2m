import { Alert, Button, Snackbar, Typography } from '@mui/material';
import { useCallback, useRef, useState, type PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

import { useRealtimeSync } from '../../hooks/use-realtime-sync';
import type { VehicleAlert } from '../../types/alert';
import { playNotificationSound } from '../../utils/notification-sound';

const alertColor = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'error',
} as const;

export function RealtimeBoundary({ children }: PropsWithChildren) {
  const [notifications, setNotifications] = useState<VehicleAlert[]>([]);
  const seenIds = useRef(new Set<string>());

  const notify = useCallback((alert: VehicleAlert) => {
    if (seenIds.current.has(alert.id)) return;
    seenIds.current.add(alert.id);
    if (seenIds.current.size > 100) {
      seenIds.current.delete(seenIds.current.values().next().value!);
    }
    setNotifications((current) => [...current, alert]);
    void playNotificationSound();
  }, []);

  useRealtimeSync(notify);

  const current = notifications[0];
  const dismiss = () => setNotifications((items) => items.slice(1));

  return (
    <>
      {children}
      <Snackbar
        key={current?.id}
        open={Boolean(current)}
        autoHideDuration={current?.severity === 'CRITICAL' ? 10_000 : 7_000}
        onClose={(_, reason) => { if (reason !== 'clickaway') dismiss(); }}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{
          top: { xs: 'calc(env(safe-area-inset-top) + 76px)', sm: 24 },
          right: { xs: 16, sm: 24 },
          left: 'auto',
          width: { xs: 'calc(100vw - 32px)', sm: 380 },
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {current ? (
          <Alert
            severity={alertColor[current.severity]}
            onClose={dismiss}
            closeText="Cerrar"
            sx={{ width: '100%', alignItems: 'flex-start', boxShadow: '0 12px 30px rgba(23, 25, 39, 0.16)' }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{current.title}</Typography>
            <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{current.message}</Typography>
            <Button component={Link} to="/alerts" onClick={dismiss} color="inherit" size="small" sx={{ mt: 1, p: 0, minWidth: 0, textDecoration: 'underline' }}>
              Ver alertas
            </Button>
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
