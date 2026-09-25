import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { OperationsService } from './operations.service.js';

@ApiTags('Operations')
@ApiBearerAuth()
@Controller()
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('vehicles/:vehicleId/operations')
  findForVehicle(@Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.operations.findForVehicle(vehicleId);
  }

  @Get('operations/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.findOne(id);
  }
}
