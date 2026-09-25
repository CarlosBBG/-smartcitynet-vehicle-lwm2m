import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OperationStatus, type Operation } from '@prisma/client';

import { BridgeService } from '../bridge/bridge.service.js';
import type { BridgeOperation } from '../bridge/bridge.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const PENDING_STATUSES: OperationStatus[] = [
  OperationStatus.requested,
  OperationStatus.published,
  OperationStatus.ttn_queued,
  OperationStatus.ttn_sent,
  OperationStatus.lorawan_acknowledged,
];

@Injectable()
export class OperationsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OperationsService.name);
  private readonly intervalMs: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly bridge: BridgeService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    config: ConfigService,
  ) {
    this.intervalMs = config.get<number>('BRIDGE_SYNC_INTERVAL_MS', 2000);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.syncOnce();
    this.timer = setInterval(() => void this.syncOnce(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async findForVehicle(vehicleId: string): Promise<Operation[]> {
    await this.assertVehicleExists(vehicleId);
    return this.prisma.operation.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string): Promise<Operation> {
    const operation = await this.prisma.operation.findUnique({ where: { id } });
    if (!operation) throw new NotFoundException('Operación no encontrada');
    return operation;
  }

  findPending(vehicleId: string): Promise<Operation | null> {
    return this.prisma.operation.findFirst({
      where: { vehicleId, status: { in: PENDING_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findLatest(vehicleId: string): Promise<Operation | null> {
    return this.prisma.operation.findFirst({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async syncOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const [bridgeOperations, vehicles] = await Promise.all([
        this.bridge.getOperations(),
        this.prisma.vehicle.findMany({
          where: { deletedAt: null },
          select: { id: true, deviceId: true },
        }),
      ]);
      const vehicleByDevice = new Map(
        vehicles.map((vehicle) => [vehicle.deviceId, vehicle.id]),
      );
      for (const bridgeOperation of bridgeOperations) {
        const vehicleId = vehicleByDevice.get(bridgeOperation.device_id);
        if (vehicleId) await this.syncOperation(vehicleId, bridgeOperation);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sincronización de operaciones omitida: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async syncOperation(
    vehicleId: string,
    source: BridgeOperation,
  ): Promise<void> {
    const bridgeKey = [
      source.device_id,
      source.transaction_id,
      source.created_at,
    ].join(':');
    const status = bridgeStatus(source.status);
    const createdAt = bridgeDate(source.created_at);
    const updatedAt = bridgeDate(source.updated_at);
    const existing = await this.prisma.operation.findUnique({
      where: { bridgeKey },
    });
    const data = {
      vehicleId,
      transactionId: source.transaction_id,
      resourcePath: source.resource_path,
      requestedValue: source.requested_value,
      status,
      commandStatus: source.command_status,
      createdAt,
      updatedAt,
    };

    if (!existing) {
      const created = await this.prisma.operation.create({
        data: { bridgeKey, ...data },
      });
      this.realtime.emitOperationUpdated(created);
      return;
    }
    if (
      existing.status !== status ||
      existing.commandStatus !== source.command_status ||
      existing.updatedAt.getTime() !== updatedAt.getTime()
    ) {
      const updated = await this.prisma.operation.update({
        where: { id: existing.id },
        data,
      });
      this.realtime.emitOperationUpdated(updated);
    }
  }

  private async assertVehicleExists(vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado');
  }
}

function bridgeStatus(status: string): OperationStatus {
  if (status === 'lorawan_not_acknowledged') return OperationStatus.ttn_failed;
  return Object.values(OperationStatus).includes(status as OperationStatus)
    ? (status as OperationStatus)
    : OperationStatus.rejected;
}

function bridgeDate(value: string): Date {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
