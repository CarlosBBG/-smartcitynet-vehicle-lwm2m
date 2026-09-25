import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { LeshanService } from '../leshan/leshan.service.js';
import type {
  LeshanClientRegistration,
  LeshanInstanceContent,
} from '../leshan/leshan.types.js';
import { OperationsService } from '../operations/operations.service.js';
import { VehiclesService } from '../vehicles/vehicles.service.js';
import {
  SMARTCITYNET_OBJECT_ID,
  SMARTCITYNET_RESOURCES,
} from './lwm2m-resources.js';

const INSTANCE_ID = 0;
const LIGHT_RESOURCES = {
  front: 23,
  rear: 24,
  parking: 25,
  left: 32,
  right: 33,
} as const;

export type LightName = keyof typeof LIGHT_RESOURCES;

@Injectable()
export class Lwm2mService {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly leshan: LeshanService,
    private readonly operations: OperationsService,
  ) {}

  async getDetails(vehicleId: string) {
    const vehicle = await this.vehicles.findOne(vehicleId);
    const client = await this.leshan.getClient(vehicle.lwm2mEndpoint);
    const resources = client
      ? await this.readResources(vehicle.lwm2mEndpoint)
      : [];
    return {
      endpoint: vehicle.lwm2mEndpoint,
      registered: Boolean(client),
      server: 'Eclipse Leshan',
      registration: client ? registrationSummary(client) : null,
      objects: client ? [3, SMARTCITYNET_OBJECT_ID] : [],
      resources,
    };
  }

  async getResources(vehicleId: string) {
    const vehicle = await this.vehicles.findOne(vehicleId);
    await this.assertRegistered(vehicle.lwm2mEndpoint);
    return this.readResources(vehicle.lwm2mEndpoint);
  }

  async setTransmissionInterval(vehicleId: string, value: number) {
    return this.write(vehicleId, 0, value);
  }

  async setRemoteAlert(vehicleId: string, value: boolean) {
    return this.write(vehicleId, 11, value);
  }

  async setLight(vehicleId: string, light: string, value: boolean) {
    if (!isLightName(light)) {
      throw new NotFoundException('Control de luz no encontrado');
    }
    return this.write(vehicleId, LIGHT_RESOURCES[light], value);
  }

  private async write(
    vehicleId: string,
    resourceId: number,
    value: number | boolean,
  ) {
    const requestedAt = Date.now();
    const vehicle = await this.vehicles.findOne(vehicleId);
    if (!vehicle.enabled) {
      throw conflict('VEHICLE_DISABLED', 'El vehículo está desactivado');
    }
    await this.assertRegistered(vehicle.lwm2mEndpoint);
    await this.operations.syncOnce();
    if (await this.operations.findPending(vehicle.id)) {
      throw conflict(
        'OPERATION_PENDING',
        'El vehículo ya tiene una operación en curso',
      );
    }

    if (typeof value === 'boolean') {
      await this.leshan.writeBooleanResource(
        vehicle.lwm2mEndpoint,
        SMARTCITYNET_OBJECT_ID,
        INSTANCE_ID,
        resourceId,
        value,
      );
    } else {
      await this.leshan.writeIntegerResource(
        vehicle.lwm2mEndpoint,
        SMARTCITYNET_OBJECT_ID,
        INSTANCE_ID,
        resourceId,
        value,
      );
    }
    await this.operations.syncOnce();
    const latestOperation = await this.operations.findLatest(vehicle.id);
    const operation =
      latestOperation &&
      latestOperation.resourcePath ===
        `/${SMARTCITYNET_OBJECT_ID}/${INSTANCE_ID}/${resourceId}` &&
      latestOperation.createdAt.getTime() >= requestedAt - 5000
        ? latestOperation
        : null;
    return {
      accepted: true,
      state: operation?.status ?? 'requested',
      operation,
    };
  }

  private async assertRegistered(endpoint: string): Promise<void> {
    if (!(await this.leshan.getClient(endpoint))) {
      throw conflict(
        'LWM2M_CLIENT_NOT_REGISTERED',
        'El cliente LwM2M del vehículo no está registrado en Leshan',
      );
    }
  }

  private async readResources(endpoint: string) {
    const response = await this.leshan.readObject(
      endpoint,
      SMARTCITYNET_OBJECT_ID,
      INSTANCE_ID,
    );
    if (!response.success || !response.content) return [];
    if (!isInstanceContent(response.content)) return [];
    const content = response.content;
    const values = new Map(
      content.resources.map((resource) => [resource.id, resource]),
    );
    return SMARTCITYNET_RESOURCES.map((definition) => {
      const resource = values.get(definition.id);
      return {
        ...definition,
        path: `/${SMARTCITYNET_OBJECT_ID}/${INSTANCE_ID}/${definition.id}`,
        type: resource?.type ?? 'UNKNOWN',
        value: resource?.value ?? null,
        available: Boolean(resource),
      };
    });
  }
}

function isLightName(value: string): value is LightName {
  return Object.hasOwn(LIGHT_RESOURCES, value);
}

function isInstanceContent(value: unknown): value is LeshanInstanceContent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LeshanInstanceContent>;
  return candidate.kind === 'instance' && Array.isArray(candidate.resources);
}

function registrationSummary(client: LeshanClientRegistration) {
  return {
    registrationId: client.registrationId,
    lastUpdate: client.lastUpdate,
    lifetime: client.lifetime,
    secure: client.secure,
    version: client.lwM2mVersion,
  };
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ statusCode: 409, code, message });
}
