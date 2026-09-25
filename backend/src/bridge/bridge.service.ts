import { HttpService } from '@nestjs/axios';
import {
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import type {
  BridgeDevice,
  BridgeHealth,
  BridgeOperation,
} from './bridge.types.js';

@Injectable()
export class BridgeService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.getOrThrow<string>('BRIDGE_URL').replace(/\/+$/, '');
  }

  health(): Promise<BridgeHealth> {
    return this.get<BridgeHealth>('/health');
  }

  getDevices(): Promise<BridgeDevice[]> {
    return this.get<BridgeDevice[]>('/devices');
  }

  async getDevice(deviceId: string): Promise<BridgeDevice | null> {
    try {
      return await this.get<BridgeDevice>(
        `/devices/${encodeURIComponent(deviceId)}`,
      );
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  getOperations(): Promise<BridgeOperation[]> {
    return this.get<BridgeOperation[]>('/operations');
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
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'BRIDGE_UNAVAILABLE',
        message: 'No fue posible consultar el Bridge de SmartCityNet',
      });
    }
  }
}
