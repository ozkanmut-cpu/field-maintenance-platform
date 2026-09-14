import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AssignedWeeklyWorkloadService } from './assigned-weekly-workload.service';
import { BacktestService } from './backtest.service';
import { AdminAiController } from './admin-ai.controller';
import { ColdStartService } from './cold-start.service';
import { DataMaturityService } from './data-maturity.service';
import { DataQualityEngineService } from './data-quality-engine.service';
import { FeatureStoreService } from './feature-store.service';
import { GeographyService } from './geography.service';
import { LocationIntelligenceService } from './location-intelligence.service';
import { IdentityConfidenceService } from './identity-confidence.service';
import { GeographyClusteringService } from './geography-clustering.service';
import { EffectiveWorkloadService } from './effective-workload.service';
import { EquipmentProfileService } from './equipment-profile.service';
import { PointDifficultyService } from './point-difficulty.service';
import { PlanningEngineService } from './planning-engine.service';
import { RegionHealthService } from './region-health.service';
import { RiskEngineService } from './risk-engine.service';
import { SimilarWeekService } from './similar-week.service';
import { TechnicianBaselineService } from './technician-baseline.service';
import { TrendService } from './trend.service';
import { WeeklyWorkloadService } from './weekly-workload.service';
import { WhatIfService } from './what-if.service';

@Module({
  imports: [PrismaModule, AssignmentsModule],
  controllers: [AdminAiController],
  providers: [BacktestService, EffectiveWorkloadService, AssignedWeeklyWorkloadService, GeographyService, GeographyClusteringService, LocationIntelligenceService, IdentityConfidenceService, FeatureStoreService, EquipmentProfileService, DataQualityEngineService, DataMaturityService, ColdStartService, PointDifficultyService, PlanningEngineService, RegionHealthService, TechnicianBaselineService, TrendService, WeeklyWorkloadService, RiskEngineService, SimilarWeekService, WhatIfService],
  exports: [BacktestService, EffectiveWorkloadService, AssignedWeeklyWorkloadService, GeographyService, GeographyClusteringService, LocationIntelligenceService, IdentityConfidenceService, FeatureStoreService, EquipmentProfileService, DataQualityEngineService, DataMaturityService, ColdStartService, PointDifficultyService, PlanningEngineService, RegionHealthService, TechnicianBaselineService, TrendService, WeeklyWorkloadService, RiskEngineService, SimilarWeekService, WhatIfService],
})
export class AiModule {}
