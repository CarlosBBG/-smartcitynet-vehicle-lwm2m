import { Box, Paper, Typography } from '@mui/material';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  helper: string;
  icon: LucideIcon;
  tint: string;
  color: string;
}

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tint,
  color,
}: MetricCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        minHeight: 126,
        p: 2.25,
        borderRadius: 2,
        bgcolor: tint,
        border: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Box
          sx={{
            width: 32,
            height: 32,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 1.25,
            bgcolor: 'rgba(255,255,255,.65)',
            color,
          }}
        >
          <Icon size={17} aria-hidden="true" />
        </Box>
      </Box>
      <Box sx={{ mt: 2 }}>
        <Typography sx={{ fontSize: 30, lineHeight: 1, fontWeight: 600, letterSpacing: '-.035em' }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {helper}
        </Typography>
      </Box>
    </Paper>
  );
}
