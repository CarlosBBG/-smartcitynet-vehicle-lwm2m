import { HttpService } from '@nestjs/axios';
import {
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { ApiException } from '../common/errors/api.exception.js';
import type {
  Lwm2mManagerClient,
  Lwm2mManagerError,
  Lwm2mManagerHealth,
} from './lwm2m-manager.types.js';

@Injectable()
export class Lwm2mManagerService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config
      .getOrThrow<string>('LWM2M_MANAGER_URL')
      .replace(/\/+$/, '');
  }

  health(): Promise<Lwm2mManagerHealth> {
    return this.get<Lwm2mManagerHealth>('/health');
  }

  getClients(): Promise<Lwm2mManagerClient[]> {
    return this.get<Lwm2mManagerClient[]>('/clients');
  }

  startClient(deviceId: string, endpoint: string): Promise<Lwm2mManagerClient> {
    return this.post<Lwm2mManagerClient>('/clients', { deviceId, endpoint });
  }

  stopClient(endpoint: string): Promise<Lwm2mManagerClient> {
    return this.delete<Lwm2mManagerClient>(
      `/clients/${encodeURIComponent(endpoint)}`,
    );
  }

  private async get<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<T>(`${this.baseUrl}${path}`),
      );
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.post<T>(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private async delete<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.delete<T>(`${this.baseUrl}${path}`),
      );
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): Error {
    if (error instanceof AxiosError && error.response) {
      const data = error.response.data as Lwm2mManagerError | undefined;
      const status = error.response.status;
      if (status >= 400 && status < 500) {
        return new ApiException(
          status as HttpStatus,
          data?.code ?? 'LWM2M_MANAGER_REQUEST_FAILED',
          data?.message ?? `El manager respondió HTTP ${status}`,
        );
      }
    }
    return new ServiceUnavailableException({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'LWM2M_MANAGER_UNAVAILABLE',
      message: 'El administrador de clientes LwM2M no está disponible',
    });
  }
}
