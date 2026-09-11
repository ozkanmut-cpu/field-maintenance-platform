import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureStoreService } from './feature-store.service';

@Module({
  imports: [PrismaModule],
  providers: [FeatureStoreService],
  exports: [FeatureStoreService],
})
export class AiModule {}
