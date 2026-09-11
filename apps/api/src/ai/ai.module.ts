import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AssignedWeeklyWorkloadService } from './assigned-weekly-workload.service';
import { ColdStartService } from './cold-start.service';
import { DataMaturityService } from './data-maturity.service';
import { FeatureStoreService } from './feature-store.service';
import { GeographyService } from './geography.service';
import { GeographyClusteringService } from './geography-clustering.service';
import { EffectiveWorkloadService } from './effective-workload.service';
import { PointDifficultyService } from './point-difficulty.service';
import { TechnicianBaselineService } from './technician-baseline.service';

@Module({
  imports: [PrismaModule, AssignmentsModule],
  providers: [EffectiveWorkloadService, AssignedWeeklyWorkloadService, GeographyService, GeographyClusteringService, FeatureStoreService, DataMaturityService, ColdStartService, PointDifficultyService, TechnicianBaselineService],
  exports: [EffectiveWorkloadService, AssignedWeeklyWorkloadService, GeographyService, GeographyClusteringService, FeatureStoreService, DataMaturityService, ColdStartService, PointDifficultyService, TechnicianBaselineService],
})
export class AiModule {}
