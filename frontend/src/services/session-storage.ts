import type { AuthSession } from '../types/auth';
import { isRecord } from '../utils/type-guards';

const SESSION_KEY = 'smartcitynet.session';

export function readSession(): AuthSession | null {
  const value = localStorage.getItem(SESSION_KEY);
  if (!value) return null;

  try {
    const session: unknown = JSON.parse(value);
    if (!isAuthSession(session)) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value)) return false;
  const session = value;
  const user = session.user;
  if (!isRecord(user)) return false;
  const account = user;

  return (
    typeof session.accessToken === 'string' &&
    typeof account.id === 'string' &&
    typeof account.name === 'string' &&
    typeof account.email === 'string' &&
    (account.role === 'ADMIN' || account.role === 'VIEWER')
  );
}

export function writeSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
