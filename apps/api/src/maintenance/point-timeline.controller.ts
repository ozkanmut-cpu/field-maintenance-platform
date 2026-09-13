import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PointTimelineService } from './point-timeline.service';

@Roles(UserRole.ADMIN)
@Controller('maintenance/point-timeline')
export class PointTimelineController {
  constructor(private readonly timeline: PointTimelineService) {}

  @Get()
  get(@Query('pointId') pointId: string, @Query('limit') limit?: string) {
    return this.timeline.get(pointId, limit ? Number(limit) : 200);
  }
}
