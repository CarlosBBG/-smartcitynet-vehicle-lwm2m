import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { TelemetryService } from './telemetry.service.js';

describe('TelemetryService', () => {
  it('pagina y filtra el histórico por fechas', async () => {
    const telemetry = { id: 'telemetry-1' };
    const findMany = vi.fn().mockResolvedValue([telemetry]);
    const count = vi.fn().mockResolvedValue(1);
    const prisma = {
      vehicle: { findFirst: vi.fn().mockResolvedValue({ id: 'vehicle-1' }) },
      telemetry: { findMany, count },
      $transaction: vi
        .fn()
        .mockImplementation((operations: Promise<unknown>[]) =>
          Promise.all(operations),
        ),
    } as unknown as PrismaService;
    const service = new TelemetryService(prisma);

    const result = await service.findAll('vehicle-1', {
      from: '2026-09-20T00:00:00.000Z',
      to: '2026-09-21T00:00:00.000Z',
      page: 2,
      limit: 25,
    });

    expect(result).toEqual({
      items: [telemetry],
      total: 1,
      page: 2,
      limit: 25,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
  });

  it('rechaza un intervalo de fechas invertido', async () => {
    const prisma = {
      vehicle: { findFirst: vi.fn().mockResolvedValue({ id: 'vehicle-1' }) },
    } as unknown as PrismaService;
    const service = new TelemetryService(prisma);

    await expect(
      service.findAll('vehicle-1', {
        from: '2026-09-22T00:00:00.000Z',
        to: '2026-09-21T00:00:00.000Z',
        page: 1,
        limit: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('informa cuando no existe telemetría para el vehículo', async () => {
    const prisma = {
      vehicle: { findFirst: vi.fn().mockResolvedValue({ id: 'vehicle-1' }) },
      telemetry: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new TelemetryService(prisma);

    await expect(service.findLatest('vehicle-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
