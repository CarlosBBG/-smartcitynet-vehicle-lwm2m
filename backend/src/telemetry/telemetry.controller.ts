import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TelemetryQueryDto } from './dto/telemetry-query.dto.js';
import { TelemetryService } from './telemetry.service.js';

@ApiTags('Telemetry')
@ApiBearerAuth()
@Controller('vehicles/:vehicleId/telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get('latest')
  findLatest(@Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.telemetry.findLatest(vehicleId);
  }

  @Get()
  findAll(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: TelemetryQueryDto,
  ) {
    return this.telemetry.findAll(vehicleId, query);
  }
}
