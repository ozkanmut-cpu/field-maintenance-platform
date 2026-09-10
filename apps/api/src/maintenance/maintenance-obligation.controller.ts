import { Controller, Get, Param } from '@nestjs/common';
import { MaintenanceObligationService } from './maintenance-obligation.service';

@Controller('maintenance/obligations')
export class MaintenanceObligationController {
  constructor(private readonly obligations: MaintenanceObligationService) {}

  @Get('point/:pointId/history')
  history(@Param('pointId') pointId: string) {
    return this.obligations.history(pointId);
  }
}
