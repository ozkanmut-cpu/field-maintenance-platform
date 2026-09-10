import { Module } from '@nestjs/common';
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
    MaintenanceService,
  ],
  exports: [
    MaintenanceEngineService,
    MaintenanceAnomalyService,
    PointLocationLearningService,
    MaintenanceService,
  ],
})
export class MaintenanceModule {}
