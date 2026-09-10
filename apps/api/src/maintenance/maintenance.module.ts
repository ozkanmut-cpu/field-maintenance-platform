import { Module } from '@nestjs/common';
import { MaintenanceAnomalyService } from './maintenance-anomaly.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceEngineService } from './maintenance-engine.service';
import { MaintenanceService } from './maintenance.service';

@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceEngineService, MaintenanceAnomalyService, MaintenanceService],
  exports: [MaintenanceEngineService, MaintenanceAnomalyService, MaintenanceService],
})
export class MaintenanceModule {}
