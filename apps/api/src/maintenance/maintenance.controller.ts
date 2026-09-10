import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { GooglePlaceMatchService } from './google-place-match.service';
import { MaintenanceAnomalyService } from './maintenance-anomaly.service';
import { BulkUpdatePaperworkDto } from './dto/bulk-update-paperwork.dto';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceAttemptDto } from './dto/maintenance-attempt.dto';
import { NonMaintenanceVisitDto } from './dto/non-maintenance-visit.dto';
import { ResolveReviewDto } from './dto/resolve-review.dto';
import { RevertMaintenanceDto } from './dto/revert-maintenance.dto';
import { UpdatePaperworkDto } from './dto/update-paperwork.dto';
import { MaintenanceService } from './maintenance.service';
import { NonMaintenanceVisitService } from './non-maintenance-visit.service';
import { PointLocationLearningService } from './point-location-learning.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly anomaly: MaintenanceAnomalyService,
    private readonly locationLearning: PointLocationLearningService,
    private readonly googlePlaces: GooglePlaceMatchService,
    private readonly nonMaintenanceVisits: NonMaintenanceVisitService,
  ) {}

  @Get('due')
  due(@Query('asOf') asOf?: string) {
    return this.maintenance.due(asOf);
  }

  @Get('technician-dashboard')
  technicianDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('technicianId') technicianId?: string,
    @Query('asOf') asOf?: string,
  ) {
    const targetId = user.role === UserRole.ADMIN && technicianId ? technicianId : user.id;
    return this.maintenance.technicianDashboard(targetId, asOf);
  }

  @Get('technician-history')
  async technicianHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('technicianId') technicianId?: string,
    @Query('date') date?: string,
  ) {
    const targetId = user.role === UserRole.ADMIN && technicianId ? technicianId : user.id;
    const [maintenanceHistory, otherVisits] = await Promise.all([
      this.maintenance.technicianHistory(targetId, date),
      this.nonMaintenanceVisits.technicianHistory(targetId, date),
    ]);

    const otherItems = otherVisits.items.map((item) => ({
      type: 'NON_MAINTENANCE_VISIT' as const,
      at: item.visitedAt,
      ...item,
    }));

    const items = [...maintenanceHistory.items, ...otherItems].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );

    return {
      ...maintenanceHistory,
      nonMaintenanceVisitCount: otherVisits.count,
      totalOperations: items.length,
      items,
    };
  }

  @Get('non-maintenance-visits')
  nonMaintenanceVisitHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('technicianId') technicianId?: string,
    @Query('date') date?: string,
  ) {
    const targetId = user.role === UserRole.ADMIN && technicianId ? technicianId : user.id;
    return this.nonMaintenanceVisits.technicianHistory(targetId, date);
  }

  @Roles(UserRole.ADMIN)
  @Get('paperwork-history')
  paperworkHistory(@Query('visitId') visitId: string) {
    return this.maintenance.paperworkHistory(visitId);
  }

  @Roles(UserRole.ADMIN)
  @Get('review-queue')
  reviewQueue(@Query('limit') limit?: string) {
    return this.anomaly.reviewQueue(limit ? Number(limit) : 100);
  }

  @Roles(UserRole.ADMIN)
  @Get('review-history')
  reviewHistory(@Query('visitId') visitId: string) {
    return this.anomaly.reviewHistory(visitId);
  }

  @Roles(UserRole.TECHNICIAN)
  @Post('complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Body() dto: CompleteMaintenanceDto) {
    return this.maintenance.complete({ ...dto, technicianId: user.id });
  }

  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @Post('revert')
  revert(@CurrentUser() user: AuthenticatedUser, @Body() dto: RevertMaintenanceDto) {
    return this.maintenance.revert({ ...dto, userId: user.id });
  }

  @Roles(UserRole.TECHNICIAN)
  @Post('attempt')
  attempt(@CurrentUser() user: AuthenticatedUser, @Body() dto: MaintenanceAttemptDto) {
    return this.maintenance.recordAttempt({ ...dto, technicianId: user.id });
  }

  @Roles(UserRole.TECHNICIAN)
  @Post('non-maintenance-visit')
  nonMaintenanceVisit(@CurrentUser() user: AuthenticatedUser, @Body() dto: NonMaintenanceVisitDto) {
    return this.nonMaintenanceVisits.create({ ...dto, technicianId: user.id });
  }

  @Roles(UserRole.ADMIN)
  @Post('paperwork')
  paperwork(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePaperworkDto) {
    return this.maintenance.updatePaperwork({ ...dto, adminUserId: user.id });
  }

  @Roles(UserRole.ADMIN)
  @Post('paperwork/bulk')
  paperworkBulk(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkUpdatePaperworkDto) {
    return this.maintenance.bulkUpdatePaperwork({
      ...dto,
      items: dto.items.map((item) => ({ ...item, adminUserId: user.id })),
    });
  }

  @Roles(UserRole.ADMIN)
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

  @Roles(UserRole.ADMIN)
  @Post('review-resolve')
  reviewResolve(@CurrentUser() user: AuthenticatedUser, @Body() dto: ResolveReviewDto) {
    return this.anomaly.resolveReview({ ...dto, adminUserId: user.id });
  }

  @Roles(UserRole.ADMIN)
  @Post('location-refresh')
  locationRefresh(@Query('pointId') pointId: string) {
    return this.locationLearning.refreshPoint(pointId);
  }

  @Roles(UserRole.ADMIN)
  @Post('location-refresh-all')
  locationRefreshAll(@Query('limit') limit?: string) {
    return this.locationLearning.refreshEligiblePoints(limit ? Number(limit) : 100);
  }

  @Roles(UserRole.ADMIN)
  @Post('google-place-match')
  googlePlaceMatch(@Query('pointId') pointId: string) {
    return this.googlePlaces.matchPoint(pointId);
  }

  @Roles(UserRole.ADMIN)
  @Post('google-place-match-all')
  googlePlaceMatchAll(@Query('limit') limit?: string) {
    return this.googlePlaces.matchEligiblePoints(limit ? Number(limit) : 50);
  }
}
