import { Box, Button, Typography } from '@mui/material';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
  };
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  const ActionIcon = action?.icon;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
      }}
    >
      <Box>
        {eyebrow && (
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}
          >
            {eyebrow}
          </Typography>
        )}
        <Typography component="h1" variant="h1" sx={{ mt: eyebrow ? 0.5 : 0 }}>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 680 }}>
          {description}
        </Typography>
      </Box>
      {action && (
        <Button
          variant="contained"
          onClick={action.onClick}
          startIcon={ActionIcon ? <ActionIcon size={17} /> : undefined}
        >
          {action.label}
        </Button>
      )}
    </Box>
  );
}
