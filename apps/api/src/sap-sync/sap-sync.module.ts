import { Module } from '@nestjs/common';
import { SapSyncController } from './sap-sync.controller';
@Module({ controllers:[SapSyncController] })
export class SapSyncModule {}
