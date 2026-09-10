import { Module } from '@nestjs/common';
import { ProspectConfirmationService } from './prospect-confirmation.service';
import { ProspectsController } from './prospects.controller';
import { ProspectsService } from './prospects.service';

@Module({
  controllers: [ProspectsController],
  providers: [ProspectsService, ProspectConfirmationService],
  exports: [ProspectsService, ProspectConfirmationService],
})
export class ProspectsModule {}
