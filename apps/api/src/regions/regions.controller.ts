import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ChangeRegionTechnicianDto } from './dto/change-region-technician.dto';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { RegionsService } from './regions.service';

@Roles(UserRole.ADMIN)
@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  list() {
    return this.regions.list();
  }

  @Get(':id/technician-change-preview')
  technicianChangePreview(
    @Param('id') id: string,
    @Query('technicianId') technicianId: string,
  ) {
    return this.regions.technicianChangePreview(id, technicianId);
  }

  @Get(':id/audit-history')
  auditHistory(@Param('id') id: string) {
    return this.regions.auditHistory(id);
  }

  @Post()
  create(@Body() dto: CreateRegionDto) {
    return this.regions.create(dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateRegionDto) {
    return this.regions.update(id, { ...dto, adminUserId: user.id });
  }

  @Patch(':id/technician')
  changeTechnician(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ChangeRegionTechnicianDto) {
    return this.regions.changeTechnician(id, { ...dto, adminUserId: user.id });
  }
}
