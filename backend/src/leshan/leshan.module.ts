import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { LeshanController } from './leshan.controller.js';
import { LeshanService } from './leshan.service.js';

@Module({
  imports: [HttpModule.register({ timeout: 15_000, maxRedirects: 0 })],
  controllers: [LeshanController],
  providers: [LeshanService],
  exports: [LeshanService],
})
export class LeshanModule {}
