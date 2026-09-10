import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AddPointAliasDto } from './dto/add-point-alias.dto';
import { CreatePointDto } from './dto/create-point.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { PointsService } from './points.service';

@Controller('points')
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get()
  list() {
    return this.points.list();
  }

  @Get('duplicate-suggestions')
  duplicateSuggestions(
    @Query('adminUserId') adminUserId: string,
    @Query('limit') limit?: string,
  ) {
    return this.points.duplicateSuggestions(adminUserId, limit ? Number(limit) : 100);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.points.get(id);
  }

  @Get(':id/aliases')
  aliases(@Param('id') id: string) {
    return this.points.aliases(id);
  }

  @Post()
  create(@Body() dto: CreatePointDto) {
    return this.points.create(dto);
  }

  @Post(':id/aliases')
  addAlias(@Param('id') id: string, @Body() dto: AddPointAliasDto) {
    return this.points.addAlias(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePointDto) {
    return this.points.update(id, dto);
  }
}
