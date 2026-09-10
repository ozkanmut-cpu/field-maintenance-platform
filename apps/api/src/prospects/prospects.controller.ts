import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { CreateProspectVisitDto } from './dto/create-prospect-visit.dto';
import { EfesimExtractDto } from './dto/efesim-extract.dto';
import { ProspectsService } from './prospects.service';

@Controller('prospects')
export class ProspectsController {
  constructor(private readonly prospects: ProspectsService) {}

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
}
