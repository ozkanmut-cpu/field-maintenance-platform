import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('due')
  due(@Query('asOf') asOf?: string) {
    return this.maintenance.due(asOf);
  }

  @Post('complete')
  complete(@Body() dto: CompleteMaintenanceDto) {
    return this.maintenance.complete(dto);
  }
}
