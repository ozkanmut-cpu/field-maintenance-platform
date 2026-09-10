import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateRegionDto } from './dto/create-region.dto';
import { RegionsService } from './regions.service';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  list() {
    return this.regions.list();
  }

  @Post()
  create(@Body() dto: CreateRegionDto) {
    return this.regions.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateRegionDto) {
    return this.regions.update(id, dto);
  }
}
