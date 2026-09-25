import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AlertsModule } from '../alerts/alerts.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ProvisioningSignalsModule } from '../provisioning/provisioning-signals.module.js';
import { BridgeSyncService } from './bridge-sync.service.js';
import { BridgeService } from './bridge.service.js';

@Module({
  imports: [
    HttpModule.register({
      timeout: 3000,
      maxRedirects: 0,
    }),
    AlertsModule,
    RealtimeModule,
    ProvisioningSignalsModule,
  ],
  providers: [BridgeService, BridgeSyncService],
  exports: [BridgeService, BridgeSyncService],
})
export class BridgeModule {}
