import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { LeshanService } from './leshan.service.js';

@ApiTags('LwM2M')
@ApiBearerAuth()
@Controller('lwm2m')
export class LeshanController {
  constructor(private readonly leshan: LeshanService) {}

  @Get('clients')
  async getClients() {
    const clients = await this.leshan.getClients();
    return {
      count: clients.length,
      clients: clients.map((client) => ({
        endpoint: client.endpoint,
        registrationId: client.registrationId,
        lastUpdate: client.lastUpdate,
        lifetime: client.lifetime,
        secure: client.secure,
      })),
    };
  }
}
