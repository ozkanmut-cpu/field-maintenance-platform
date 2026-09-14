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
import { EquipmentProfileService } from './equipment-profile.service';
import { PointDifficultyService } from './point-difficulty.service';
import { PlanningEngineService } from './planning-engine.service';
import { RiskEngineService } from './risk-engine.service';
import { SimilarWeekService } from './similar-week.service';
import { TechnicianBaselineService } from './technician-baseline.service';
import { WeeklyWorkloadService } from './weekly-workload.service';
import { WhatIfService } from './what-if.service';

@Module({
  imports: [PrismaModule, AssignmentsModule],
  controllers: [AdminAiController],
  providers: [EffectiveWorkloadService, AssignedWeeklyWorkloadService, GeographyService, GeographyClusteringService, FeatureStoreService, EquipmentProfileService, DataMaturityService, ColdStartService, PointDifficultyService, PlanningEngineService, TechnicianBaselineService, WeeklyWorkloadService, RiskEngineService, SimilarWeekService, WhatIfService],
  exports: [EffectiveWorkloadService, AssignedWeeklyWorkloadService, GeographyService, GeographyClusteringService, FeatureStoreService, EquipmentProfileService, DataMaturityService, ColdStartService, PointDifficultyService, PlanningEngineService, TechnicianBaselineService, WeeklyWorkloadService, RiskEngineService, SimilarWeekService, WhatIfService],
})
export class AiModule {}
