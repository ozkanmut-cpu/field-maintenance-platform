import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AssignedWeeklyWorkloadService } from './assigned-weekly-workload.service';
import { AdminAiController } from './admin-ai.controller';
import { ColdStartService } from './cold-start.service';
import { DataMaturityService } from './data-maturity.service';
import { FeatureStoreService } from './feature-store.service';
import { GeographyService } from './geography.service';
import { GeographyClusteringService } from './geography-clustering.service';
import { EffectiveWorkloadService } from './effective-workload.service';
import { PointDifficultyService } from './point-difficulty.service';
import { RiskEngineService } from './risk-engine.service';
import { TechnicianBaselineService } from './technician-baseline.service';
import { WeeklyWorkloadService } from './weekly-workload.service';

@Module({
  imports: [PrismaModule, AssignmentsModule],
  controllers: [AdminAiController],
  providers: [EffectiveWorkloadService, AssignedWeeklyWorkloadService, GeographyService, GeographyClusteringService, FeatureStoreService, DataMaturityService, ColdStartService, PointDifficultyService, TechnicianBaselineService, WeeklyWorkloadService, RiskEngineService],
  exports: [EffectiveWorkloadService, AssignedWeeklyWorkloadService, GeographyService, GeographyClusteringService, FeatureStoreService, DataMaturityService, ColdStartService, PointDifficultyService, TechnicianBaselineService, WeeklyWorkloadService, RiskEngineService],
})
export class AiModule {}
