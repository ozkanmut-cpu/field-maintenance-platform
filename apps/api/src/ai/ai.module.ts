import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ColdStartService } from './cold-start.service';
import { DataMaturityService } from './data-maturity.service';
import { FeatureStoreService } from './feature-store.service';
import { GeographyService } from './geography.service';
import { GeographyClusteringService } from './geography-clustering.service';
import { EffectiveWorkloadService } from './effective-workload.service';
import { PointDifficultyService } from './point-difficulty.service';

@Module({
  imports: [PrismaModule],
  providers: [EffectiveWorkloadService, GeographyService, GeographyClusteringService, FeatureStoreService, DataMaturityService, ColdStartService, PointDifficultyService],
  exports: [EffectiveWorkloadService, GeographyService, GeographyClusteringService, FeatureStoreService, DataMaturityService, ColdStartService, PointDifficultyService],
})
export class AiModule {}
