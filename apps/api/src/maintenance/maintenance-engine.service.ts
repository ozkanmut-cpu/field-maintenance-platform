import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MaintenanceObligationStatus,
  MaintenanceType,
  PointStatus,
  VisitStatus,
} from '@prisma/client';
import { AssignmentsService } from '../assignments/assignments.service';
import { PrismaService } from '../prisma/prisma.service';

type Priority = 'OVERDUE' | 'CURRENT';

@Injectable()
export class MaintenanceEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly assignments: AssignmentsService,
  ) {}

  async due(asOfInput?: string) {
    const asOf = this.toDateOnly(asOfInput ? new Date(asOfInput) : new Date());
    await this.ensureStandardObligations(asOf);

    const standardObligations = await this.prisma.maintenanceObligation.findMany({
      where: {
        status: MaintenanceObligationStatus.OPEN,
        dueStart: { lte: asOf },
        point: {
          status: PointStatus.ACTIVE,
          deletedAt: null,
          maintenanceType: MaintenanceType.STANDARD,
        },
      },
      include: { point: { include: { region: true } } },
      orderBy: [{ dueStart: 'asc' }],
    });

    const standardByPoint = new Map<string, typeof standardObligations>();
    for (const obligation of standardObligations) {
      const list = standardByPoint.get(obligation.pointId) ?? [];
      list.push(obligation);
      standardByPoint.set(obligation.pointId, list);
    }

    const standardRows = Array.from(standardByPoint.values()).map((obligations) => {
      const oldest = obligations[0];
      const overdueCount = obligations.filter((item) => item.dueEnd < asOf).length;
      return {
        pointId: oldest.point.id,
        pointCode: oldest.point.code,
        pointName: oldest.point.name,
        regionId: oldest.point.regionId,
        regionName: oldest.point.region.name,
        maintenanceType: oldest.point.maintenanceType,
        maintenanceWeek: oldest.point.maintenanceWeek,
        dueStart: oldest.dueStart,
        dueEnd: oldest.dueEnd,
        priority: overdueCount > 0 ? ('OVERDUE' as Priority) : ('CURRENT' as Priority),
        overduePeriods: overdueCount,
        obligationId: oldest.id,
      };
    });

    const smartcleanPoints = await this.prisma.point.findMany({
      where: {
        status: PointStatus.ACTIVE,
        deletedAt: null,
        maintenanceType: MaintenanceType.SMARTCLEAN,
      },
      include: {
        region: true,
        visits: {
          where: { status: VisitStatus.VALID },
          orderBy: { performedAt: 'desc' },
          take: 1,
        },
      },
    });

    const smartcleanRows = smartcleanPoints
      .map((point) => {
        const base = point.visits[0]?.performedAt ?? point.smartcleanReferenceAt;
        if (!base) return null;
        const dueDate = this.addCalendarMonths(this.toDateOnly(base), 2);
        if (dueDate > asOf) return null;
        return {
          pointId: point.id,
          pointCode: point.code,
          pointName: point.name,
          regionId: point.regionId,
          regionName: point.region.name,
          maintenanceType: point.maintenanceType,
          maintenanceWeek: null,
          dueStart: dueDate,
          dueEnd: dueDate,
          priority: dueDate < asOf ? ('OVERDUE' as Priority) : ('CURRENT' as Priority),
          overduePeriods: dueDate < asOf ? 1 : 0,
          obligationId: null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const rawRows = [...standardRows, ...smartcleanRows];
    const effectiveAssignments = await this.assignments.resolveMany(rawRows.map((row) => row.pointId), asOf);

    const rows = rawRows
      .map((row) => {
        const assignment = effectiveAssignments.get(row.pointId);
        return {
          ...row,
          technicianId: assignment?.technicianId ?? null,
          assignmentSource: assignment?.source ?? 'REGION',
          assignmentId: assignment?.assignmentId ?? null,
        };
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === 'OVERDUE' ? -1 : 1;
        if (a.overduePeriods !== b.overduePeriods) return b.overduePeriods - a.overduePeriods;
        if (a.dueStart.getTime() !== b.dueStart.getTime()) return a.dueStart.getTime() - b.dueStart.getTime();
        return a.pointName.localeCompare(b.pointName, 'tr');
      });

    return { asOf, count: rows.length, items: rows };
  }

  async ensureStandardObligations(asOfInput?: Date) {
    const asOf = this.toDateOnly(asOfInput ?? new Date());
    const points = await this.prisma.point.findMany({
      where: { status: PointStatus.ACTIVE, deletedAt: null, maintenanceType: MaintenanceType.STANDARD },
      select: { id: true, maintenanceWeek: true, createdAt: true },
    });

    for (const point of points) {
      if (![1, 2].includes(point.maintenanceWeek ?? 0)) continue;
      const firstEligible = this.firstAssignedWindowOnOrAfter(this.toDateOnly(point.createdAt), point.maintenanceWeek!);
      let start = firstEligible.start;
      while (start <= asOf) {
        const end = this.addDays(start, 6);
        await this.prisma.maintenanceObligation.upsert({
          where: { pointId_cycleKey: { pointId: point.id, cycleKey: `STD:${this.isoDate(start)}` } },
          update: {},
          create: {
            pointId: point.id,
            cycleKey: `STD:${this.isoDate(start)}`,
            dueStart: start,
            dueEnd: end,
            status: MaintenanceObligationStatus.OPEN,
          },
        });
        start = this.addDays(start, 14);
      }
    }
  }

  private firstAssignedWindowOnOrAfter(date: Date, maintenanceWeek: number) {
    const monday = this.startOfWeek(date);
    const slot = this.slotForWeek(monday);
    let start = monday;
    if (slot !== maintenanceWeek) start = this.addDays(start, 7);
    if (date > this.addDays(start, 6)) start = this.addDays(start, 14);
    return { start, end: this.addDays(start, 6) };
  }

  private slotForWeek(monday: Date) {
    const anchorValue = this.config.get<string>('STANDARD_WEEK1_ANCHOR');
    if (!anchorValue) throw new Error('STANDARD_WEEK1_ANCHOR is required');
    const anchor = this.startOfWeek(this.toDateOnly(new Date(anchorValue)));
    const diffWeeks = Math.floor((monday.getTime() - anchor.getTime()) / 604800000);
    const parity = ((diffWeeks % 2) + 2) % 2;
    return parity === 0 ? 1 : 2;
  }

  private addCalendarMonths(date: Date, months: number) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const firstOfTarget = new Date(Date.UTC(year, month + months, 1));
    const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), Math.min(day, lastDay)));
  }

  private startOfWeek(date: Date) {
    const day = date.getUTCDay();
    const delta = day === 0 ? -6 : 1 - day;
    return this.addDays(date, delta);
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  }

  private toDateOnly(date: Date) {
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
