import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AddPointAliasDto } from './dto/add-point-alias.dto';
import { CreatePointDto } from './dto/create-point.dto';
import { ImportPointsDto } from './dto/import-points.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { PointsService } from './points.service';

@Controller('points')
export class PointsController {
  constructor(private readonly points: PointsService) {}

  @Get()
  list() {
    return this.points.list();
  }

  @Roles(UserRole.ADMIN)
  @Get('duplicate-suggestions')
  duplicateSuggestions(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    return this.points.duplicateSuggestions(user.id, limit ? Number(limit) : 100);
  }

  @Roles(UserRole.ADMIN)
  @Get('setup-pending')
  setupPending() {
    return this.points.setupPending();
  }

  @Roles(UserRole.ADMIN)
  @Post('import')
  importPoints(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportPointsDto) {
    return this.points.importPoints(user.id, dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.points.get(id);
  }

  @Get(':id/aliases')
  aliases(@Param('id') id: string) {
    return this.points.aliases(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePointDto) {
    return this.points.create(user.id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/aliases')
  addAlias(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AddPointAliasDto) {
    return this.points.addAlias(id, { ...dto, adminUserId: user.id });
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdatePointDto) {
    return this.points.update(user.id, id, dto);
  }
}
