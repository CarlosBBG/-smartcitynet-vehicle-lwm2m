import { alpha, createTheme } from '@mui/material/styles';

import { tokens } from './tokens';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: tokens.color.ink, contrastText: '#ffffff' },
    secondary: { main: tokens.color.blue },
    success: { main: tokens.color.mint },
    warning: { main: tokens.color.amber },
    error: { main: tokens.color.coral },
    background: {
      default: tokens.color.canvas,
      paper: tokens.color.surface,
    },
    text: {
      primary: tokens.color.ink,
      secondary: tokens.color.inkMuted,
    },
    divider: tokens.color.line,
  },
  typography: {
    fontFamily: '"Ubuntu", "DejaVu Sans", Arial, sans-serif',
    h1: { fontSize: '2rem', lineHeight: 1.15, fontWeight: 600, letterSpacing: '-0.03em' },
    h2: { fontSize: '1.5rem', lineHeight: 1.25, fontWeight: 600, letterSpacing: '-0.02em' },
    h3: { fontSize: '1.125rem', lineHeight: 1.35, fontWeight: 600 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', lineHeight: 1.4 },
    button: { fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none' },
  },
  shape: { borderRadius: tokens.radius.sm },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': { colorScheme: 'light' },
        body: { minWidth: 320 },
        '::selection': {
          background: alpha(tokens.color.blue, 0.22),
          color: tokens.color.ink,
        },
        '*': { boxSizing: 'border-box' },
        '*:focus-visible': {
          outline: `3px solid ${alpha(tokens.color.blue, 0.34)}`,
          outlineOffset: 2,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderColor: tokens.color.line,
          '&.MuiPaper-elevation1': {
            boxShadow: '0 10px 30px rgba(26, 34, 52, 0.06)',
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          minHeight: 40,
          paddingInline: 16,
          '&.MuiButton-containedPrimary:hover': {
            backgroundColor: '#292c3d',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: tokens.color.surface,
        },
        notchedOutline: { borderColor: tokens.color.lineStrong },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: tokens.radius.md, border: `1px solid ${tokens.color.line}` },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 8, fontSize: 12 },
      },
    },
  },
});
