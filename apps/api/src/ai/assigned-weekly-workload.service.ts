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
  equipmentKnownPointCount: number;
  equipmentUnknownPointCount: number;
  assignedCoolerCount: number;
  assignedTowerCount: number;
  assignedTapCount: number;
  assignedSmarttapCount: number;
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
    const [effective, pointProfiles] = await Promise.all([
      this.assignments.resolveMany(pointIds, asOf),
      pointIds.length
        ? this.prisma.point.findMany({
            where: { id: { in: pointIds } },
            select: { id: true, coolerCount: true, towerCount: true, tapCount: true, smarttapCount: true },
          })
        : [],
    ]);
    const profileByPoint = new Map(pointProfiles.map((point) => [point.id, point]));
    const rows = new Map<string, TechnicianAssignedWeeklyWorkload>();
    const unassigned = { standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0 };
    const seenEquipment = new Set<string>();

    const rowFor = (technicianId: string) => {
      const existing = rows.get(technicianId);
      if (existing) return existing;
      const row: TechnicianAssignedWeeklyWorkload = {
        technicianId,
        standardCurrent: 0,
        standardCarryover: 0,
        smartcleanCurrent: 0,
        smartcleanCarryover: 0,
        equipmentKnownPointCount: 0,
        equipmentUnknownPointCount: 0,
        assignedCoolerCount: 0,
        assignedTowerCount: 0,
        assignedTapCount: 0,
        assignedSmarttapCount: 0,
      };
      rows.set(technicianId, row);
      return row;
    };

    const add = (pointId: string, key: keyof typeof unassigned) => {
      const technicianId = effective.get(pointId)?.technicianId ?? null;
      if (!technicianId) return void (unassigned[key] += 1);
      const row = rowFor(technicianId);
      row[key] += 1;
      if (seenEquipment.has(pointId)) return;
      seenEquipment.add(pointId);
      const profile = profileByPoint.get(pointId);
      const complete = profile && [profile.coolerCount, profile.towerCount, profile.tapCount, profile.smarttapCount].every((value) => value !== null);
      if (!complete || !profile) return void (row.equipmentUnknownPointCount += 1);
      row.equipmentKnownPointCount += 1;
      row.assignedCoolerCount += profile.coolerCount ?? 0;
      row.assignedTowerCount += profile.towerCount ?? 0;
      row.assignedTapCount += profile.tapCount ?? 0;
      row.assignedSmarttapCount += profile.smarttapCount ?? 0;
    };

    for (const item of standard) add(item.pointId, item.dueEnd < week.weekStart ? 'standardCarryover' : 'standardCurrent');
    for (const item of smartclean) add(item.pointId, item.state === 'CARRYOVER' ? 'smartcleanCarryover' : 'smartcleanCurrent');

    return { weekKey: week.key, technicians: [...rows.values()].sort((a, b) => a.technicianId.localeCompare(b.technicianId)), unassigned };
  }
}
