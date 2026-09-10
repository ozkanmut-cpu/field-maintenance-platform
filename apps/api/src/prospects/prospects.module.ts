import { Module } from '@nestjs/common';
import { ProspectConfirmationService } from './prospect-confirmation.service';
import { ProspectConversionService } from './prospect-conversion.service';
import { ProspectsController } from './prospects.controller';
import { ProspectsService } from './prospects.service';

@Module({
  controllers: [ProspectsController],
  providers: [ProspectsService, ProspectConfirmationService, ProspectConversionService],
  exports: [ProspectsService, ProspectConfirmationService, ProspectConversionService],
})
export class ProspectsModule {}
