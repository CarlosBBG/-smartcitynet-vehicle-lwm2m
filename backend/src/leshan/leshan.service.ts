import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import type {
  LeshanClientRegistration,
  LeshanHealth,
  LeshanResponse,
} from './leshan.types.js';

@Injectable()
export class LeshanService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('LESHAN_URL').replace(/\/+$/, '');
  }

  async health(): Promise<LeshanHealth> {
    const clients = await this.getClients();
    return { status: 'ok', clients: clients.length };
  }

  getClients(): Promise<LeshanClientRegistration[]> {
    return this.get<LeshanClientRegistration[]>('/api/clients');
  }

  async getClient(endpoint: string): Promise<LeshanClientRegistration | null> {
    try {
      return await this.get<LeshanClientRegistration>(
        `/api/clients/${encodeURIComponent(endpoint)}`,
      );
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  readObject(
    endpoint: string,
    objectId: number,
    instanceId: number,
  ): Promise<LeshanResponse> {
    return this.get<LeshanResponse>(
      this.resourcePath(endpoint, objectId, instanceId),
    );
  }

  readResource(
    endpoint: string,
    objectId: number,
    instanceId: number,
    resourceId: number,
  ): Promise<LeshanResponse> {
    return this.get<LeshanResponse>(
      `${this.resourcePath(endpoint, objectId, instanceId)}/${resourceId}`,
    );
  }

  async writeIntegerResource(
    endpoint: string,
    objectId: number,
    instanceId: number,
    resourceId: number,
    value: number,
  ): Promise<LeshanResponse> {
    if (!Number.isSafeInteger(value)) {
      throw new BadGatewayException('El valor INTEGER no es válido');
    }
    return this.writeResource(endpoint, objectId, instanceId, resourceId, {
      kind: 'singleResource',
      id: resourceId,
      type: 'INTEGER',
      value: String(value),
    });
  }

  writeBooleanResource(
    endpoint: string,
    objectId: number,
    instanceId: number,
    resourceId: number,
    value: boolean,
  ): Promise<LeshanResponse> {
    return this.writeResource(endpoint, objectId, instanceId, resourceId, {
      kind: 'singleResource',
      id: resourceId,
      type: 'BOOLEAN',
      value,
    });
  }

  private async writeResource(
    endpoint: string,
    objectId: number,
    instanceId: number,
    resourceId: number,
    body: Record<string, unknown>,
  ): Promise<LeshanResponse> {
    const response = await this.put<LeshanResponse>(
      `${this.resourcePath(endpoint, objectId, instanceId)}/${resourceId}`,
      body,
    );
    if (!response.success || response.failure) {
      throw new BadGatewayException({
        statusCode: 502,
        code: 'LESHAN_WRITE_FAILED',
        message:
          response.errorMessage ??
          `Leshan rechazó la escritura: ${response.status}`,
      });
    }
    return response;
  }

  private resourcePath(
    endpoint: string,
    objectId: number,
    instanceId: number,
  ): string {
    return `/api/clients/${encodeURIComponent(endpoint)}/${objectId}/${instanceId}`;
  }

  private async get<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.get<T>(`${this.baseUrl}${path}`),
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw error;
      }
      throw this.mapUnavailable(error);
    }
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.http.put<T>(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.mapUnavailable(error);
    }
  }

  private mapUnavailable(error: unknown): Error {
    if (error instanceof AxiosError && error.response) {
      return new BadGatewayException({
        statusCode: 502,
        code: 'LESHAN_REQUEST_FAILED',
        message: `Leshan respondió HTTP ${error.response.status}`,
      });
    }
    return new ServiceUnavailableException({
      statusCode: 503,
      code: 'LESHAN_UNAVAILABLE',
      message: 'Eclipse Leshan no está disponible',
    });
  }
}
