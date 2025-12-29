import { createTheme } from '@mui/material/styles';

// Export CSS custom properties for use in regular CSS
export const themeColors = {
  primaryMain: '#27272A',
  primaryLight: '#3F3F46',
  primaryDark: '#18181B',
  secondaryMain: '#52525B',
  successMain: '#16A34A',
  successDark: '#15803D',
  errorMain: '#DC2626',
  errorDark: '#B91C1C',
  warningMain: '#EA580C',
  warningDark: '#C2410C',
  backgroundDefault: '#FAFAF9',
  backgroundPaper: '#FFFFFF',
  textPrimary: '#27272A',
  textSecondary: '#52525B',
  textDisabled: '#A8A29E',
  divider: '#E7E5E4',
  borderLight: '#F5F5F4',
};

// Apply CSS variables to :root
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  Object.entries(themeColors).forEach(([key, value]) => {
    root.style.setProperty(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value);
  });
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#27272A',
      light: '#3F3F46',
      dark: '#18181B',
      contrastText: '#FAFAF9',
    },
    secondary: {
      main: '#52525B',
      light: '#71717A',
      dark: '#3F3F46',
      contrastText: '#FAFAF9',
    },
    success: {
      main: '#16A34A',
      light: '#22C55E',
      dark: '#15803D',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#DC2626',
      light: '#EF4444',
      dark: '#B91C1C',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#EA580C',
      light: '#F97316',
      dark: '#C2410C',
      contrastText: '#FFFFFF',
    },
    info: {
      main: '#3F3F46',
      light: '#52525B',
      dark: '#27272A',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#FAFAF9',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#27272A',
      secondary: '#52525B',
      disabled: '#A8A29E',
    },
    divider: '#E7E5E4',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
    h1: {
      fontSize: '26px',
      fontWeight: 500,
      color: '#27272A',
    },
    h2: {
      fontSize: '18px',
      fontWeight: 500,
      color: '#3F3F46',
    },
    body1: {
      fontSize: '15px',
      lineHeight: 1.8,
      color: '#52525B',
    },
  },
  shape: {
    borderRadius: 8,
  },
  shadows: [
    'none',
    '0 1px 3px rgba(0, 0, 0, 0.04)',
    '0 1px 3px rgba(0, 0, 0, 0.08)',
    '0 2px 4px rgba(0, 0, 0, 0.08)',
    '0 4px 8px rgba(0, 0, 0, 0.08)',
    '0 8px 16px rgba(0, 0, 0, 0.08)',
    '0 12px 24px rgba(0, 0, 0, 0.08)',
    '0 16px 32px rgba(0, 0, 0, 0.08)',
    '0 20px 40px rgba(0, 0, 0, 0.08)',
    '0 24px 48px rgba(0, 0, 0, 0.08)',
    ...Array(15).fill('none'),
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 400,
          fontSize: '14px',
          padding: '9px 18px',
          borderRadius: '6px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: '#E7E5E4',
          color: '#3F3F46',
          backgroundColor: '#F5F5F4',
          '&:hover': {
            backgroundColor: '#E7E5E4',
            borderColor: '#E7E5E4',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          border: '1px solid #E7E5E4',
          boxShadow: 'none',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#FFFFFF',
            '& fieldset': {
              borderColor: '#E7E5E4',
            },
            '&:hover fieldset': {
              borderColor: '#A8A29E',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#A8A29E',
              borderWidth: '1px',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#52525B',
          boxShadow: 'none',
          borderBottom: '1px solid #E7E5E4',
        },
      },
    },
  },
});

export default theme;