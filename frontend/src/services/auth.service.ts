import type {
  AuthSession,
  AuthUser,
  LoginCredentials,
} from '../types/auth';
import { api } from './api';

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  const { data } = await api.post<AuthSession>('/auth/login', credentials);
  return data;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}
