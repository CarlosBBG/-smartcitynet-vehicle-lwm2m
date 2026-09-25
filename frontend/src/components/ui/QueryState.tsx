import { Alert, Box, CircularProgress, Typography } from '@mui/material';

export function LoadingState({ label = 'Cargando datos' }: { label?: string }) {
  return (
    <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <Box>
        <CircularProgress size={28} thickness={4} />
        <Typography color="text.secondary" sx={{ mt: 1.5 }}>
          {label}
        </Typography>
      </Box>
    </Box>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <Alert severity="error">{message}</Alert>;
}
