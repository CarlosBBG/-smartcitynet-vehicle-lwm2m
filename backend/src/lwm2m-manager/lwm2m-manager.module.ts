import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { Lwm2mManagerService } from './lwm2m-manager.service.js';

@Module({
  imports: [HttpModule.register({ timeout: 20_000, maxRedirects: 0 })],
  providers: [Lwm2mManagerService],
  exports: [Lwm2mManagerService],
})
export class Lwm2mManagerModule {}
