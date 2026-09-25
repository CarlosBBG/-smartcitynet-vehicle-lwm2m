import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { BridgeModule } from './bridge/bridge.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { validateEnvironment } from './config/environment.js';
import { LeshanModule } from './leshan/leshan.module.js';
import { Lwm2mManagerModule } from './lwm2m-manager/lwm2m-manager.module.js';
import { Lwm2mModule } from './lwm2m/lwm2m.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProvisioningSignalsModule } from './provisioning/provisioning-signals.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { UsersModule } from './users/users.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    ProvisioningSignalsModule,
    LeshanModule,
    Lwm2mManagerModule,
    UsersModule,
    AuthModule,
    AlertsModule,
    VehiclesModule,
    RealtimeModule,
    BridgeModule,
    TelemetryModule,
    OperationsModule,
    Lwm2mModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
