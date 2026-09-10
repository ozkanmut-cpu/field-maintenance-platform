import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { PointsModule } from './points/points.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegionsModule } from './regions/regions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    RegionsModule,
    PointsModule,
    MaintenanceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
