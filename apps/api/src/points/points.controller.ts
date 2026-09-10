import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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

  @Get(':id')
  get(@Param('id') id: string) {
    return this.points.get(id);
  }

  @Post()
  create(@Body() dto: CreatePointDto) {
    return this.points.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePointDto) {
    return this.points.update(id, dto);
  }
}
