import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssignmentsModule } from './assignments/assignments.module';
import { HealthController } from './health/health.controller';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { PointsModule } from './points/points.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProspectsModule } from './prospects/prospects.module';
import { RegionsModule } from './regions/regions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    UsersModule,
    RegionsModule,
    PointsModule,
    AssignmentsModule,
    ProspectsModule,
    MaintenanceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
