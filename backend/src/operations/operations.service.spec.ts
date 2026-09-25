import type { ConfigService } from '@nestjs/config';
import { OperationStatus } from '@prisma/client';

import type { BridgeService } from '../bridge/bridge.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { OperationsService } from './operations.service.js';

describe('OperationsService', () => {
  it('importa una operación del Bridge y publica la actualización en tiempo real', async () => {
    const source = {
      device_id: 'heltec-labredes',
      transaction_id: 41,
      resource_path: '/32769/0/23',
      requested_value: 1,
      status: 'ttn_queued',
      command_status: null,
      created_at: '2026-09-22T10:00:00Z',
      updated_at: '2026-09-22T10:00:02Z',
    };
    const created = {
      id: 'operation-1',
      vehicleId: 'vehicle-1',
      status: OperationStatus.ttn_queued,
    };
    const create = vi.fn().mockResolvedValue(created);
    const emitOperationUpdated = vi.fn();
    const service = new OperationsService(
      { getOperations: vi.fn().mockResolvedValue([source]) } as unknown as BridgeService,
      {
        vehicle: { findMany: vi.fn().mockResolvedValue([{ id: 'vehicle-1', deviceId: source.device_id }]) },
        operation: { findUnique: vi.fn().mockResolvedValue(null), create },
      } as unknown as PrismaService,
      { emitOperationUpdated } as unknown as RealtimeGateway,
      { get: vi.fn().mockReturnValue(2000) } as unknown as ConfigService,
    );

    await service.syncOnce();

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bridgeKey: 'heltec-labredes:41:2026-09-22T10:00:00Z',
        vehicleId: 'vehicle-1',
        status: OperationStatus.ttn_queued,
      }),
    });
    expect(emitOperationUpdated).toHaveBeenCalledWith(created);
  });
});
