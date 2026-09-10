import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceAttemptDto } from './dto/maintenance-attempt.dto';
import { RevertMaintenanceDto } from './dto/revert-maintenance.dto';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('due')
  due(@Query('asOf') asOf?: string) {
    return this.maintenance.due(asOf);
  }

  @Get('technician-dashboard')
  technicianDashboard(
    @Query('technicianId') technicianId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.maintenance.technicianDashboard(technicianId, asOf);
  }

  @Post('complete')
  complete(@Body() dto: CompleteMaintenanceDto) {
    return this.maintenance.complete(dto);
  }

  @Post('revert')
  revert(@Body() dto: RevertMaintenanceDto) {
    return this.maintenance.revert(dto);
  }

  @Post('attempt')
  attempt(@Body() dto: MaintenanceAttemptDto) {
    return this.maintenance.recordAttempt(dto);
  }
}
