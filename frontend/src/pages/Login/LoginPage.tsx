import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { Eye, EyeOff, RadioTower } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../services/api';
import smartcitynetLogin from '../../assets/images/smartcitynet-login.png';

export function LoginPage() {
  const { authenticated, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authenticated) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await login({ email, password });
      void navigate('/', { replace: true });
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    } finally {
      setPending(false);
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        overflowY: 'auto',
        overflowX: 'hidden',
        background:
          'linear-gradient(145deg, #eef3f5 0%, #f7f8fa 52%, #edf0f6 100%)',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          minHeight: '100%',
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: '1fr 1fr',
          },
          borderRadius: 0,
          overflow: 'hidden',
          border: 'none',
        }}
      >
        <Box
          sx={{
            display: {
              xs: 'none',
              md: 'block',
            },
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#071a36',
          }}
        >
          <Box
            component="img"
            src={smartcitynetLogin}
            alt="SmartCityNet LoRaWAN"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              display: 'block',
            }}
          />
        </Box>

        <Box
          sx={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            py: { xs: 3, md: 4 },
            px: {
              xs: 3,
              md: 8,
            },
          }}
        >
          <Box
            component="form"
            onSubmit={submit}
            sx={{
              width: '100%',
              maxWidth: 420,
            }}
          >
            <Box
              sx={{
                display: {
                  xs: 'flex',
                  md: 'none',
                },
                alignItems: 'center',
                gap: 1,
                mb: 5,
              }}
            >
              <RadioTower size={20} />
              <Typography sx={{ fontWeight: 600 }}>
                SmartCityNet
              </Typography>
            </Box>

            <Typography
              component="h1"
              variant="h1"
              sx={{
                fontWeight: 700,
              }}
            >
              Iniciar sesión
            </Typography>

            <Typography
              color="text.secondary"
              sx={{
                mt: 1,
                mb: 4,
              }}
            >
              Use las credenciales asignadas para administrar los vehículos.
            </Typography>

            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 2.5,
                }}
              >
                {error}
              </Alert>
            )}

            <TextField
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              fullWidth
              sx={{
                mb: 2,
              }}
            />

            <TextField
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              fullWidth
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        onClick={() =>
                          setShowPassword((value) => !value)
                        }
                        edge="end"
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                mb: 3,
              }}
            />

            <Button
              aria-label="Entrar a SmartCityNet"
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={pending}
              sx={{
                height: 48,
              }}
            >
              {pending ? (
                <CircularProgress
                  size={20}
                  color="inherit"
                />
              ) : (
                'Entrar'
              )}
            </Button>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                mt: 3,
                textAlign: 'center',
              }}
            >
              Las credenciales TTN no se solicitan ni almacenan aquí.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
