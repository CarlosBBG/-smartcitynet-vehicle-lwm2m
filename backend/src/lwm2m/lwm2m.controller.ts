import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '../common/decorators/roles.decorator.js';
import { SetBooleanDto } from './dto/set-boolean.dto.js';
import { SetTransmissionIntervalDto } from './dto/set-transmission-interval.dto.js';
import { Lwm2mService } from './lwm2m.service.js';

@ApiTags('LwM2M')
@ApiBearerAuth()
@Controller('vehicles/:vehicleId/lwm2m')
export class Lwm2mController {
  constructor(private readonly lwm2m: Lwm2mService) {}

  @Get()
  getDetails(@Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.lwm2m.getDetails(vehicleId);
  }

  @Get('resources')
  getResources(@Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.lwm2m.getResources(vehicleId);
  }

  @Roles(Role.ADMIN)
  @Put('transmission-interval')
  setTransmissionInterval(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: SetTransmissionIntervalDto,
  ) {
    return this.lwm2m.setTransmissionInterval(vehicleId, dto.value);
  }

  @Roles(Role.ADMIN)
  @Put('remote-alert')
  setRemoteAlert(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: SetBooleanDto,
  ) {
    return this.lwm2m.setRemoteAlert(vehicleId, dto.value);
  }

  @Roles(Role.ADMIN)
  @Put('lights/:light')
  setLight(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('light') light: string,
    @Body() dto: SetBooleanDto,
  ) {
    return this.lwm2m.setLight(vehicleId, light, dto.value);
  }
}
