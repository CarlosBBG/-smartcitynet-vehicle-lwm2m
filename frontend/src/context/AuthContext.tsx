import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { login as requestLogin } from '../services/auth.service';
import {
  clearSession,
  readSession,
  writeSession,
} from '../services/session-storage';
import type { AuthSession, LoginCredentials } from '../types/auth';

interface AuthContextValue {
  session: AuthSession | null;
  authenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(() => readSession());

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const nextSession = await requestLogin(credentials);
    writeSession(nextSession);
    setSession(nextSession);
  }, []);

  useEffect(() => {
    window.addEventListener('smartcitynet:unauthorized', logout);
    return () => window.removeEventListener('smartcitynet:unauthorized', logout);
  }, [logout]);

  const value = useMemo(
    () => ({ session, authenticated: Boolean(session), login, logout }),
    [login, logout, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return context;
}
