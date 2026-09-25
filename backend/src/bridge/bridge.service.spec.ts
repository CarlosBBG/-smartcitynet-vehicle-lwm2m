import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

import { BridgeService } from './bridge.service.js';

describe('BridgeService', () => {
  it('consulta los endpoints de lectura sin publicar comandos', async () => {
    const get = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/devices')) {
        return of({ data: [] });
      }
      if (url.endsWith('/operations')) {
        return of({ data: [] });
      }
      return of({ data: { status: 'ok' } });
    });
    const http = { get } as unknown as HttpService;
    const config = {
      getOrThrow: vi.fn().mockReturnValue('http://127.0.0.1:8081/'),
    } as unknown as ConfigService;
    const service = new BridgeService(http, config);

    await expect(service.health()).resolves.toEqual({ status: 'ok' });
    await expect(service.getDevices()).resolves.toEqual([]);
    await expect(service.getOperations()).resolves.toEqual([]);
    expect(get).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8081/health');
    expect(get).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8081/devices');
    expect(get).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:8081/operations');
  });

  it('codifica el deviceId antes de consultar un dispositivo', async () => {
    const get = vi.fn().mockReturnValue(
      of({
        data: {
          device_id: 'heltec norte',
          endpoint: 'smartcitynet-heltec norte',
          dev_eui: null,
          last_seen: new Date().toISOString(),
          rssi: null,
          snr: null,
          state: {},
        },
      }),
    );
    const service = new BridgeService(
      { get } as unknown as HttpService,
      {
        getOrThrow: vi.fn().mockReturnValue('http://127.0.0.1:8081'),
      } as unknown as ConfigService,
    );

    await service.getDevice('heltec norte');

    expect(get).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/devices/heltec%20norte',
    );
  });
});
