import { Module } from '@nestjs/common';

import { BridgeModule } from '../bridge/bridge.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';

@Module({
  imports: [BridgeModule, RealtimeModule],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
