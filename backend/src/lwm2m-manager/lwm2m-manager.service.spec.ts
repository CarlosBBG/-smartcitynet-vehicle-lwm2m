import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

import { Lwm2mManagerService } from './lwm2m-manager.service.js';

describe('Lwm2mManagerService', () => {
  it('aprovisiona y detiene clientes usando endpoints codificados', async () => {
    const client = {
      deviceId: 'heltec-norte-01',
      endpoint: 'smartcitynet-heltec-norte-01',
      state: 'RUNNING',
      registered: true,
      startedAt: '2026-09-21T00:00:00Z',
      lastError: null,
    };
    const post = vi.fn().mockReturnValue(of({ data: client }));
    const deleteRequest = vi
      .fn()
      .mockReturnValue(
        of({ data: { ...client, state: 'STOPPED', registered: false } }),
      );
    const service = new Lwm2mManagerService(
      { post, delete: deleteRequest } as unknown as HttpService,
      {
        getOrThrow: vi.fn().mockReturnValue('http://127.0.0.1:8090/'),
      } as unknown as ConfigService,
    );

    await service.startClient(client.deviceId, client.endpoint);
    await service.stopClient(client.endpoint);

    expect(post).toHaveBeenCalledWith('http://127.0.0.1:8090/clients', {
      deviceId: client.deviceId,
      endpoint: client.endpoint,
    });
    expect(deleteRequest).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/clients/smartcitynet-heltec-norte-01',
    );
  });
});
