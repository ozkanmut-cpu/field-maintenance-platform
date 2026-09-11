import { Injectable } from '@nestjs/common';
import { MaintenanceObligationStatus, MaintenanceType, PointStatus } from '@prisma/client';
import { AssignmentsService } from '../assignments/assignments.service';
import { businessWeek } from '../common/business-week';
import { PrismaService } from '../prisma/prisma.service';
import { EffectiveWorkloadService } from './effective-workload.service';

export type TechnicianAssignedWeeklyWorkload = {
  technicianId: string;
  standardCurrent: number;
  standardCarryover: number;
  smartcleanCurrent: number;
  smartcleanCarryover: number;
};

@Injectable()
export class AssignedWeeklyWorkloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly effectiveWorkload: EffectiveWorkloadService,
  ) {}

  async forWeek(asOf = new Date()) {
    const week = businessWeek(asOf);
    const [standard, smartclean] = await Promise.all([
      this.prisma.maintenanceObligation.findMany({
        where: {
          status: { in: [MaintenanceObligationStatus.OPEN, MaintenanceObligationStatus.MISSED] },
          dueStart: { lte: week.weekEnd },
          point: { maintenanceType: MaintenanceType.STANDARD, status: PointStatus.ACTIVE, deletedAt: null },
        },
        select: { pointId: true, dueEnd: true },
        orderBy: [{ dueStart: 'asc' }, { pointId: 'asc' }],
      }),
      this.effectiveWorkload.smartcleanForWeek(asOf),
    ]);

    const pointIds = [...new Set([...standard.map((x) => x.pointId), ...smartclean.map((x) => x.pointId)])];
    const effective = await this.assignments.resolveMany(pointIds, asOf);
    const rows = new Map<string, TechnicianAssignedWeeklyWorkload>();
    const unassigned = { standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0 };

    const add = (pointId: string, key: keyof typeof unassigned) => {
      const technicianId = effective.get(pointId)?.technicianId ?? null;
      if (!technicianId) return void (unassigned[key] += 1);
      const row = rows.get(technicianId) ?? { technicianId, standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0 };
      row[key] += 1;
      rows.set(technicianId, row);
    };

    for (const item of standard) add(item.pointId, item.dueEnd < week.weekStart ? 'standardCarryover' : 'standardCurrent');
    for (const item of smartclean) add(item.pointId, item.state === 'CARRYOVER' ? 'smartcleanCarryover' : 'smartcleanCurrent');

    return { weekKey: week.key, technicians: [...rows.values()].sort((a, b) => a.technicianId.localeCompare(b.technicianId)), unassigned };
  }
}
