import { Global, Module } from '@nestjs/common';

import { ProvisioningSignalService } from './provisioning-signal.service.js';

@Global()
@Module({
  providers: [ProvisioningSignalService],
  exports: [ProvisioningSignalService],
})
export class ProvisioningSignalsModule {}
