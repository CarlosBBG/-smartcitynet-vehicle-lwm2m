import { Module } from '@nestjs/common';

import { LeshanModule } from '../leshan/leshan.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { VehiclesModule } from '../vehicles/vehicles.module.js';
import { Lwm2mController } from './lwm2m.controller.js';
import { Lwm2mService } from './lwm2m.service.js';

@Module({
  imports: [VehiclesModule, LeshanModule, OperationsModule],
  controllers: [Lwm2mController],
  providers: [Lwm2mService],
})
export class Lwm2mModule {}
