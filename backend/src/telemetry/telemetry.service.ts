import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Telemetry } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import type { TelemetryQueryDto } from './dto/telemetry-query.dto.js';

export interface TelemetryPage {
  items: Telemetry[];
  page: number;
  limit: number;
  total: number;
}

@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    vehicleId: string,
    query: TelemetryQueryDto,
  ): Promise<TelemetryPage> {
    await this.assertVehicleExists(vehicleId);
    const receivedAt = this.dateFilter(query);
    const where: Prisma.TelemetryWhereInput = {
      vehicleId,
      ...(receivedAt ? { receivedAt } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.telemetry.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.telemetry.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async findLatest(vehicleId: string): Promise<Telemetry> {
    await this.assertVehicleExists(vehicleId);
    const telemetry = await this.prisma.telemetry.findFirst({
      where: { vehicleId },
      orderBy: { receivedAt: 'desc' },
    });
    if (!telemetry) {
      throw new NotFoundException('El vehículo todavía no tiene telemetría');
    }
    return telemetry;
  }

  private async assertVehicleExists(vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehículo no encontrado');
    }
  }

  private dateFilter(
    query: TelemetryQueryDto,
  ): Prisma.DateTimeFilter | undefined {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from no puede ser posterior a to');
    }
    return from || to ? { gte: from, lte: to } : undefined;
  }
}
