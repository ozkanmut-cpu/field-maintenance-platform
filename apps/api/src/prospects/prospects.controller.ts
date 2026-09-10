import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ConfirmEfesimProspectDto } from './dto/confirm-efesim-prospect.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { CreateProspectVisitDto } from './dto/create-prospect-visit.dto';
import { EfesimExtractDto } from './dto/efesim-extract.dto';
import { ProspectConfirmationService } from './prospect-confirmation.service';
import { ProspectConversionService } from './prospect-conversion.service';
import { ProspectsService } from './prospects.service';

@Controller('prospects')
export class ProspectsController {
  constructor(
    private readonly prospects: ProspectsService,
    private readonly confirmation: ProspectConfirmationService,
    private readonly conversion: ProspectConversionService,
  ) {}

  @Get()
  list() {
    return this.prospects.list();
  }

  @Post()
  create(@Body() dto: CreateProspectDto) {
    return this.prospects.create(dto);
  }

  @Post('visits')
  createVisit(@Body() dto: CreateProspectVisitDto) {
    return this.prospects.createVisit(dto);
  }

  @Post('efesim-extract')
  extractEfesim(@Body() dto: EfesimExtractDto) {
    return this.prospects.extractEfesim(dto);
  }

  @Post('efesim-confirm')
  confirmEfesim(@Body() dto: ConfirmEfesimProspectDto) {
    return this.confirmation.confirm(dto);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.conversion.history(id);
  }

  @Post(':id/convert')
  convert(@Param('id') id: string, @Body() dto: ConvertProspectDto) {
    return this.conversion.convert(id, dto);
  }
}
