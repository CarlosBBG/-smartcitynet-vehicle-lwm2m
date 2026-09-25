import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

import { LeshanService } from './leshan.service.js';

describe('LeshanService', () => {
  it('consulta clientes y recursos mediante rutas codificadas', async () => {
    const get = vi.fn().mockImplementation((url: string) =>
      of({
        data: url.endsWith('/api/clients')
          ? []
          : { status: 'CONTENT(205)', success: true, failure: false },
      }),
    );
    const service = new LeshanService(
      { get } as unknown as HttpService,
      {
        getOrThrow: vi.fn().mockReturnValue('http://127.0.0.1:8080/'),
      } as unknown as ConfigService,
    );

    await expect(service.health()).resolves.toEqual({
      status: 'ok',
      clients: 0,
    });
    await service.readResource('smartcitynet vehículo', 32_769, 0, 23);

    expect(get).toHaveBeenLastCalledWith(
      'http://127.0.0.1:8080/api/clients/smartcitynet%20veh%C3%ADculo/32769/0/23',
    );
  });

  it('envía los tipos LwM2M correctos y valida la respuesta CoAP', async () => {
    const put = vi.fn().mockReturnValue(
      of({
        data: {
          status: 'CHANGED(204)',
          valid: true,
          success: true,
          failure: false,
        },
      }),
    );
    const service = new LeshanService(
      { put } as unknown as HttpService,
      {
        getOrThrow: vi.fn().mockReturnValue('http://127.0.0.1:8080'),
      } as unknown as ConfigService,
    );

    await service.writeIntegerResource(
      'smartcitynet-heltec-01',
      32_769,
      0,
      0,
      30,
    );
    await service.writeBooleanResource(
      'smartcitynet-heltec-01',
      32_769,
      0,
      23,
      true,
    );

    expect(put).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8080/api/clients/smartcitynet-heltec-01/32769/0/0',
      {
        kind: 'singleResource',
        id: 0,
        type: 'INTEGER',
        value: '30',
      },
    );
    expect(put).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8080/api/clients/smartcitynet-heltec-01/32769/0/23',
      {
        kind: 'singleResource',
        id: 23,
        type: 'BOOLEAN',
        value: true,
      },
    );
  });

  it('rechaza una escritura aunque el HTTP sea exitoso si Leshan reporta fallo', async () => {
    const service = new LeshanService(
      {
        put: vi.fn().mockReturnValue(
          of({
            data: {
              status: 'BAD_REQUEST(400)',
              valid: true,
              success: false,
              failure: true,
              errorMessage: 'Valor fuera de rango',
            },
          }),
        ),
      } as unknown as HttpService,
      {
        getOrThrow: vi.fn().mockReturnValue('http://127.0.0.1:8080'),
      } as unknown as ConfigService,
    );

    await expect(
      service.writeIntegerResource('smartcitynet-heltec-01', 32_769, 0, 0, 1),
    ).rejects.toMatchObject({ status: 502 });
  });
});
