import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlertSeverity,
  AlertType,
  Prisma,
  type Alert,
  type Telemetry,
  type Vehicle,
  VehicleStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { AlertsQueryDto } from './dto/alerts-query.dto.js';

interface AlertRule {
  type: AlertType;
  severity: AlertSeverity;
  active: boolean;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AlertsService {
  private readonly lowBatteryThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    config: ConfigService,
  ) {
    this.lowBatteryThreshold = config.get<number>('LOW_BATTERY_THRESHOLD', 20);
  }

  async findAll(query: AlertsQueryDto) {
    const where: Prisma.AlertWhereInput = {
      ...(query.active === undefined ? {} : { active: query.active === 'true' }),
      ...(query.acknowledged === undefined
        ? {}
        : { acknowledged: query.acknowledged === 'true' }),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
    };
    const [items, total, active, critical, warning, acknowledged] =
      await this.prisma.$transaction([
        this.prisma.alert.findMany({
          where,
          include: {
            vehicle: { select: { id: true, name: true, deviceId: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.alert.count({ where }),
        this.prisma.alert.count({ where: { active: true } }),
        this.prisma.alert.count({
          where: { active: true, severity: AlertSeverity.CRITICAL },
        }),
        this.prisma.alert.count({
          where: { active: true, severity: AlertSeverity.WARNING },
        }),
        this.prisma.alert.count({
          where: { active: true, acknowledged: true },
        }),
      ]);
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      summary: { active, critical, warning, acknowledged },
    };
  }

  async acknowledge(id: string, userId: string): Promise<Alert> {
    const current = await this.prisma.alert.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Alerta no encontrada');
    if (current.acknowledged) return current;
    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      },
    });
    this.realtime.emitAlertUpdated(updated);
    return updated;
  }

  async evaluateVehicle(
    vehicle: Vehicle,
    telemetry?: Telemetry,
  ): Promise<void> {
    await Promise.all([
      this.syncRule(vehicle, offlineRule(vehicle)),
      this.syncRule(vehicle, lwm2mRule(vehicle)),
      ...(telemetry
        ? [
            this.syncRule(vehicle, panicRule(vehicle, telemetry)),
            this.syncRule(
              vehicle,
              batteryRule(vehicle, telemetry, this.lowBatteryThreshold),
            ),
          ]
        : []),
    ]);
  }

  private async syncRule(vehicle: Vehicle, rule: AlertRule): Promise<void> {
    const current = await this.prisma.alert.findFirst({
      where: { vehicleId: vehicle.id, type: rule.type, active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (rule.active) {
      if (current) return;
      const created = await this.prisma.alert.create({
        data: {
          ruleKey: `${vehicle.id}:${rule.type}`,
          vehicleId: vehicle.id,
          type: rule.type,
          severity: rule.severity,
          title: rule.title,
          message: rule.message,
          metadata: rule.metadata,
        },
      }).catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return null;
        }
        throw error;
      });
      if (created) this.realtime.emitAlertCreated(created);
      return;
    }
    if (!current) return;
    const resolved = await this.prisma.alert.update({
      where: { id: current.id },
      data: { active: false, resolvedAt: new Date(), ruleKey: null },
    });
    this.realtime.emitAlertUpdated(resolved);
  }
}

function panicRule(vehicle: Vehicle, telemetry: Telemetry): AlertRule {
  return {
    type: AlertType.LOCAL_PANIC,
    severity: AlertSeverity.CRITICAL,
    active: telemetry.localPanicActive,
    title: 'Botón de pánico activado',
    message: `${vehicle.name} activó el botón de pánico local.`,
    metadata: { telemetryId: telemetry.id, receivedAt: telemetry.receivedAt },
  };
}

function batteryRule(
  vehicle: Vehicle,
  telemetry: Telemetry,
  threshold: number,
): AlertRule {
  const value = telemetry.batteryPercent;
  return {
    type: AlertType.LOW_BATTERY,
    severity: AlertSeverity.WARNING,
    active: value !== null && value <= threshold,
    title: 'Nivel de batería bajo',
    message:
      value === null
        ? `${vehicle.name} no dispone de una lectura de batería.`
        : `${vehicle.name} reportó ${value}% de batería.`,
    metadata: { value, threshold, telemetryId: telemetry.id },
  };
}

function offlineRule(vehicle: Vehicle): AlertRule {
  return {
    type: AlertType.VEHICLE_OFFLINE,
    severity: AlertSeverity.WARNING,
    active: vehicle.enabled && vehicle.status === VehicleStatus.OFFLINE,
    title: 'Vehículo sin conexión',
    message: `${vehicle.name} superó el tiempo permitido sin telemetría.`,
    metadata: { lastSeen: vehicle.lastSeen },
  };
}

function lwm2mRule(vehicle: Vehicle): AlertRule {
  return {
    type: AlertType.LWM2M_DISCONNECTED,
    severity: AlertSeverity.WARNING,
    active:
      vehicle.enabled &&
      vehicle.status === VehicleStatus.LWM2M_DISCONNECTED,
    title: 'Cliente LwM2M desconectado',
    message: `${vehicle.name} tiene actividad en el Bridge, pero no está registrado en Leshan.`,
    metadata: { endpoint: vehicle.lwm2mEndpoint },
  };
}
