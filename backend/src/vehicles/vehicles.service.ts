import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VehicleStatus, type Vehicle } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { ProvisioningSignalService } from '../provisioning/provisioning-signal.service.js';
import type { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto.js';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioningSignals: ProvisioningSignalService,
  ) {}

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    await this.assertIdentityAvailable(dto.deviceId, dto.devEui);
    const vehicle = await this.prisma.vehicle.create({
      data: {
        name: dto.name,
        deviceId: dto.deviceId,
        devEui: dto.devEui,
        lwm2mEndpoint: `smartcitynet-${dto.deviceId}`,
        model: dto.model,
        description: dto.description,
        status: VehicleStatus.PENDING_DISCOVERY,
      },
    });
    this.provisioningSignals.request(vehicle.id);
    return vehicle;
  }

  findAll(): Promise<Vehicle[]> {
    return this.prisma.vehicle.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehículo no encontrado');
    }
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const current = await this.findOne(id);
    if (dto.devEui && dto.devEui !== current.devEui) {
      const duplicate = await this.prisma.vehicle.findFirst({
        where: { devEui: dto.devEui, NOT: { id } },
      });
      if (duplicate) {
        throw new ConflictException(
          'El DevEUI ya está asignado a otro vehículo',
        );
      }
    }

    const enabled = dto.enabled ?? current.enabled;
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        name: dto.name,
        devEui: dto.devEui,
        model: dto.model,
        description: dto.description,
        enabled,
        status: enabled
          ? current.status === VehicleStatus.DISABLED
            ? VehicleStatus.PENDING_DISCOVERY
            : undefined
          : VehicleStatus.DISABLED,
      },
    });
    this.provisioningSignals.request(vehicle.id);
    return vehicle;
  }

  async remove(id: string): Promise<Vehicle> {
    await this.findOne(id);
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        enabled: false,
        status: VehicleStatus.DISABLED,
        deletedAt: new Date(),
      },
    });
    this.provisioningSignals.request(vehicle.id);
    return vehicle;
  }

  private async assertIdentityAvailable(
    deviceId: string,
    devEui?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.vehicle.findFirst({
      where: {
        OR: [
          { deviceId },
          { lwm2mEndpoint: `smartcitynet-${deviceId}` },
          ...(devEui ? [{ devEui }] : []),
        ],
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Device ID, endpoint LwM2M o DevEUI ya registrado',
      );
    }
  }
}
