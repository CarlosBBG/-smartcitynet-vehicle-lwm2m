import axios from 'axios';

import { isRecord } from '../utils/type-guards';
import { defaultBackendOrigin } from './backend-origin';
import { clearSession, readSession } from './session-storage';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? `${defaultBackendOrigin()}/api`,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = readSession()?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      clearSession();
      window.dispatchEvent(new Event('smartcitynet:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'No se pudo completar la solicitud.';
  const data: unknown = error.response?.data;
  if (!isRecord(data)) {
    return 'No se pudo completar la solicitud.';
  }
  const details = data;
  if (Array.isArray(details.message)) return details.message.join('. ');
  if (typeof details.message === 'string') return details.message;
  if (typeof details.error === 'string') return details.error;
  return 'No se pudo completar la solicitud.';
}
