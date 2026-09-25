import { Module } from '@nestjs/common';

import { AlertsModule } from '../alerts/alerts.module.js';
import { BridgeModule } from '../bridge/bridge.module.js';
import { LeshanModule } from '../leshan/leshan.module.js';
import { Lwm2mManagerModule } from '../lwm2m-manager/lwm2m-manager.module.js';
import { ProvisioningSignalsModule } from '../provisioning/provisioning-signals.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { VehicleProvisioningService } from './vehicle-provisioning.service.js';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';

@Module({
  imports: [
    AlertsModule,
    BridgeModule,
    LeshanModule,
    Lwm2mManagerModule,
    ProvisioningSignalsModule,
    RealtimeModule,
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehicleProvisioningService],
  exports: [VehiclesService, VehicleProvisioningService],
})
export class VehiclesModule {}
