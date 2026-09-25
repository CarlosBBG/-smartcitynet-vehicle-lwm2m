import { LeshanController } from './leshan.controller.js';
import type { LeshanService } from './leshan.service.js';

describe('LeshanController', () => {
  it('expone únicamente los datos necesarios para el dashboard', async () => {
    const getClients = vi.fn().mockResolvedValue([
      {
        endpoint: 'smartcitynet-heltec-01',
        registrationId: 'registration-1',
        lastUpdate: 1_795_000_000_000,
        lifetime: 300,
        secure: false,
        address: 'coap://127.0.0.1',
      },
    ]);
    const controller = new LeshanController({
      getClients,
    } as unknown as LeshanService);

    await expect(controller.getClients()).resolves.toEqual({
      count: 1,
      clients: [
        {
          endpoint: 'smartcitynet-heltec-01',
          registrationId: 'registration-1',
          lastUpdate: 1_795_000_000_000,
          lifetime: 300,
          secure: false,
        },
      ],
    });
  });
});
