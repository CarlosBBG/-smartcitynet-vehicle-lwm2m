import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  type OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Alert, Operation, Telemetry, Vehicle } from '@prisma/client';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server: Server;

  constructor(private readonly jwt: JwtService) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      const token = this.readToken(socket);
      if (!token) {
        next(new Error('UNAUTHORIZED'));
        return;
      }

      void this.jwt
        .verifyAsync(token)
        .then((payload: unknown) => {
          socket.data.user = payload;
          next();
        })
        .catch(() => {
          this.logger.warn('Conexión WebSocket rechazada por JWT inválido');
          next(new Error('UNAUTHORIZED'));
        });
    });
  }

  emitVehicleUpdated(vehicle: Vehicle): void {
    this.server.emit('vehicle.updated', vehicle);
  }

  emitTelemetryReceived(vehicleId: string, telemetry: Telemetry): void {
    this.server.emit('telemetry.received', { vehicleId, telemetry });
  }

  emitOperationUpdated(operation: Operation): void {
    this.server.emit('operation.updated', operation);
  }

  emitAlertCreated(alert: Alert): void {
    this.server.emit('alert.created', alert);
  }

  emitAlertUpdated(alert: Alert): void {
    this.server.emit('alert.updated', alert);
  }

  emitLwm2mStatus(vehicle: Vehicle): void {
    this.server.emit('lwm2m.status', {
      vehicleId: vehicle.id,
      endpoint: vehicle.lwm2mEndpoint,
      status: vehicle.status,
      registered: vehicle.status === 'ONLINE',
      updatedAt: vehicle.updatedAt,
    });
  }

  private readToken(socket: Socket): string | null {
    const authToken = socket.handshake.auth.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const authorization = socket.handshake.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }
    return null;
  }
}
