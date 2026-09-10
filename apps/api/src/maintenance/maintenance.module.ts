import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceEngineService } from './maintenance-engine.service';
import { MaintenanceService } from './maintenance.service';

@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceEngineService, MaintenanceService],
  exports: [MaintenanceEngineService, MaintenanceService],
})
export class MaintenanceModule {}
