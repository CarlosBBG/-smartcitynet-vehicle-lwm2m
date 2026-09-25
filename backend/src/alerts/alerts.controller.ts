import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { AlertsService } from './alerts.service.js';
import { AlertsQueryDto } from './dto/alerts-query.dto.js';

@ApiTags('Alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  findAll(@Query() query: AlertsQueryDto) {
    return this.alerts.findAll(query);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/acknowledge')
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.alerts.acknowledge(id, user.id);
  }
}
