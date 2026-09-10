import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { MaintenanceAnomalyService } from './maintenance-anomaly.service';
import { BulkUpdatePaperworkDto } from './dto/bulk-update-paperwork.dto';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceAttemptDto } from './dto/maintenance-attempt.dto';
import { RevertMaintenanceDto } from './dto/revert-maintenance.dto';
import { UpdatePaperworkDto } from './dto/update-paperwork.dto';
import { MaintenanceService } from './maintenance.service';
import { PointLocationLearningService } from './point-location-learning.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly anomaly: MaintenanceAnomalyService,
    private readonly locationLearning: PointLocationLearningService,
  ) {}

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

  @Get('technician-history')
  technicianHistory(
    @Query('technicianId') technicianId: string,
    @Query('date') date?: string,
  ) {
    return this.maintenance.technicianHistory(technicianId, date);
  }

  @Get('paperwork-history')
  paperworkHistory(@Query('visitId') visitId: string) {
    return this.maintenance.paperworkHistory(visitId);
  }

  @Get('review-queue')
  reviewQueue(@Query('limit') limit?: string) {
    return this.anomaly.reviewQueue(limit ? Number(limit) : 100);
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

  @Post('paperwork')
  paperwork(@Body() dto: UpdatePaperworkDto) {
    return this.maintenance.updatePaperwork(dto);
  }

  @Post('paperwork/bulk')
  paperworkBulk(@Body() dto: BulkUpdatePaperworkDto) {
    return this.maintenance.bulkUpdatePaperwork(dto);
  }

  @Post('anomaly-scan')
  anomalyScan(
    @Query('technicianId') technicianId: string,
    @Query('lookbackHours') lookbackHours?: string,
  ) {
    return this.anomaly.scanTechnician(
      technicianId,
      lookbackHours ? Number(lookbackHours) : 24,
    );
  }

  @Post('location-refresh')
  locationRefresh(@Query('pointId') pointId: string) {
    return this.locationLearning.refreshPoint(pointId);
  }

  @Post('location-refresh-all')
  locationRefreshAll(@Query('limit') limit?: string) {
    return this.locationLearning.refreshEligiblePoints(limit ? Number(limit) : 100);
  }
}
