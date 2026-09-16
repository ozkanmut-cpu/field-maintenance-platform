import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { PointsModule } from './points/points.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProspectsModule } from './prospects/prospects.module';
import { RegionsModule } from './regions/regions.module';
import { UsersModule } from './users/users.module';
import { SapSyncModule } from './sap-sync/sap-sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    AuditModule,
    AiModule,
    AuthModule,
    UsersModule,
    RegionsModule,
    PointsModule,
    AssignmentsModule,
    ProspectsModule,
    MaintenanceModule,
    SapSyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
