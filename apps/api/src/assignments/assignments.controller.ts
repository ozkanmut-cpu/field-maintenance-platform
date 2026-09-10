import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import {
  CreatePointAssignmentDto,
  DeactivatePointAssignmentDto,
} from './dto/create-point-assignment.dto';

@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  create(@Body() dto: CreatePointAssignmentDto) {
    return this.assignments.create(dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @Body() dto: DeactivatePointAssignmentDto) {
    return this.assignments.deactivate(id, dto);
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
