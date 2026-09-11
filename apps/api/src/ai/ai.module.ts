import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ColdStartService } from './cold-start.service';
import { DataMaturityService } from './data-maturity.service';
import { FeatureStoreService } from './feature-store.service';

@Module({
  imports: [PrismaModule],
  providers: [FeatureStoreService, DataMaturityService, ColdStartService],
  exports: [FeatureStoreService, DataMaturityService, ColdStartService],
})
export class AiModule {}
