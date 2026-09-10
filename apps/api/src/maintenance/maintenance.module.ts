import { Module } from '@nestjs/common';
import { GooglePlaceMatchService } from './google-place-match.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceAnomalyService } from './maintenance-anomaly.service';
import { MaintenanceEngineService } from './maintenance-engine.service';
import { MaintenanceService } from './maintenance.service';
import { PointLocationLearningService } from './point-location-learning.service';

@Module({
  controllers: [MaintenanceController],
  providers: [
    MaintenanceEngineService,
    MaintenanceAnomalyService,
    PointLocationLearningService,
    GooglePlaceMatchService,
    MaintenanceService,
  ],
  exports: [
    MaintenanceEngineService,
    MaintenanceAnomalyService,
    PointLocationLearningService,
    GooglePlaceMatchService,
    MaintenanceService,
  ],
})
export class MaintenanceModule {}
