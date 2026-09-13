import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { GooglePlaceMatchService } from './google-place-match.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceAnomalyService } from './maintenance-anomaly.service';
import { MaintenanceEngineService } from './maintenance-engine.service';
import { MaintenanceObligationController } from './maintenance-obligation.controller';
import { MaintenanceObligationService } from './maintenance-obligation.service';
import { MaintenanceService } from './maintenance.service';
import { NonMaintenanceVisitService } from './non-maintenance-visit.service';
import { PointLocationLearningService } from './point-location-learning.service';
import { PointTimelineController } from './point-timeline.controller';
import { PointTimelineService } from './point-timeline.service';

@Module({
  imports: [AssignmentsModule],
  controllers: [MaintenanceController, MaintenanceObligationController, PointTimelineController],
  providers: [
    MaintenanceEngineService,
    MaintenanceAnomalyService,
    PointLocationLearningService,
    GooglePlaceMatchService,
    NonMaintenanceVisitService,
    MaintenanceObligationService,
    MaintenanceService,
    PointTimelineService,
  ],
  exports: [
    MaintenanceEngineService,
    MaintenanceAnomalyService,
    PointLocationLearningService,
    GooglePlaceMatchService,
    NonMaintenanceVisitService,
    MaintenanceObligationService,
    MaintenanceService,
    PointTimelineService,
  ],
})
export class MaintenanceModule {}
