import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataMaturityService } from './data-maturity.service';
import { FeatureStoreService } from './feature-store.service';

@Module({
  imports: [PrismaModule],
  providers: [FeatureStoreService, DataMaturityService],
  exports: [FeatureStoreService, DataMaturityService],
})
export class AiModule {}
