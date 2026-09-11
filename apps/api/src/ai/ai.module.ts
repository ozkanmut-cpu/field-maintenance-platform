import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ColdStartService } from './cold-start.service';
import { DataMaturityService } from './data-maturity.service';
import { FeatureStoreService } from './feature-store.service';
import { GeographyService } from './geography.service';
import { EffectiveWorkloadService } from './effective-workload.service';

@Module({
  imports: [PrismaModule],
  providers: [EffectiveWorkloadService, GeographyService, FeatureStoreService, DataMaturityService, ColdStartService],
  exports: [EffectiveWorkloadService, GeographyService, FeatureStoreService, DataMaturityService, ColdStartService],
})
export class AiModule {}
