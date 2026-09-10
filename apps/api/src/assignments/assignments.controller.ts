import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { AssignmentsService } from './assignments.service';
import {
  CreatePointAssignmentDto,
  DeactivatePointAssignmentDto,
} from './dto/create-point-assignment.dto';

@Roles(UserRole.ADMIN)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePointAssignmentDto) {
    return this.assignments.create({ ...dto, adminUserId: user.id });
  }

  @Patch(':id/deactivate')
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DeactivatePointAssignmentDto) {
    return this.assignments.deactivate(id, { ...dto, adminUserId: user.id });
  }

  @Get(':id/audit-history')
  auditHistory(@Param('id') id: string) {
    return this.assignments.auditHistory(id);
  }

  @Get('point/:pointId')
  pointHistory(@Param('pointId') pointId: string) {
    return this.assignments.pointHistory(pointId);
  }

  @Get('effective/:pointId')
  effective(
    @Param('pointId') pointId: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.assignments.effectiveForPoint(pointId, asOf ? new Date(asOf) : undefined);
  }
}
