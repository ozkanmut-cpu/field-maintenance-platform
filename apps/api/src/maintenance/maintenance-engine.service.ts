import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MaintenanceType, PointStatus, VisitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Priority = 'OVERDUE' | 'CURRENT';

@Injectable()
export class MaintenanceEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async due(asOfInput?: string) {
    const asOf = this.toDateOnly(asOfInput ? new Date(asOfInput) : new Date());
    const points = await this.prisma.point.findMany({
      where: { status: PointStatus.ACTIVE, deletedAt: null },
      include: {
        region: { include: { technician: true } },
        visits: {
          where: { status: VisitStatus.VALID },
          orderBy: { performedAt: 'desc' },
          take: 1,
        },
      },
    });

    const rows = points
      .map((point) => {
        const lastValid = point.visits[0]?.performedAt ?? null;
        if (point.maintenanceType === MaintenanceType.SMARTCLEAN) {
          const base = lastValid ?? point.smartcleanReferenceAt;
          if (!base) return null;
          const dueDate = this.addCalendarMonths(this.toDateOnly(base), 2);
          if (dueDate > asOf) return null;
          return {
            pointId: point.id,
            pointCode: point.code,
            pointName: point.name,
            regionId: point.regionId,
            regionName: point.region.name,
            technicianId: point.region.technicianId,
            maintenanceType: point.maintenanceType,
            maintenanceWeek: null,
            dueStart: dueDate,
            dueEnd: dueDate,
            priority: dueDate < asOf ? ('OVERDUE' as Priority) : ('CURRENT' as Priority),
            overduePeriods: dueDate < asOf ? 1 : 0,
          };
        }

        const window = this.standardWindow(asOf, point.maintenanceWeek ?? 0);
        const lastDate = lastValid ? this.toDateOnly(lastValid) : null;
        const currentCompleted = lastDate ? lastDate >= window.start && lastDate <= window.end : false;
        if (currentCompleted) return null;

        const previous = this.previousStandardWindow(window.start);
        const previousCompleted = lastDate ? lastDate >= previous.start && lastDate <= previous.end : false;

        if (!previousCompleted && (!lastDate || lastDate < previous.start)) {
          const missed = this.countMissedStandardPeriods(lastDate, window.start, point.maintenanceWeek ?? 0);
          return {
            pointId: point.id,
            pointCode: point.code,
            pointName: point.name,
            regionId: point.regionId,
            regionName: point.region.name,
            technicianId: point.region.technicianId,
            maintenanceType: point.maintenanceType,
            maintenanceWeek: point.maintenanceWeek,
            dueStart: previous.start,
            dueEnd: previous.end,
            priority: 'OVERDUE' as Priority,
            overduePeriods: Math.max(1, missed),
          };
        }

        if (asOf >= window.start && asOf <= window.end) {
          return {
            pointId: point.id,
            pointCode: point.code,
            pointName: point.name,
            regionId: point.regionId,
            regionName: point.region.name,
            technicianId: point.region.technicianId,
            maintenanceType: point.maintenanceType,
            maintenanceWeek: point.maintenanceWeek,
            dueStart: window.start,
            dueEnd: window.end,
            priority: 'CURRENT' as Priority,
            overduePeriods: 0,
          };
        }

        return null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === 'OVERDUE' ? -1 : 1;
        if (a.overduePeriods !== b.overduePeriods) return b.overduePeriods - a.overduePeriods;
        return a.pointName.localeCompare(b.pointName, 'tr');
      });

    return { asOf, count: rows.length, items: rows };
  }

  private standardWindow(asOf: Date, maintenanceWeek: number) {
    if (![1, 2].includes(maintenanceWeek)) throw new Error('Invalid maintenance week');
    const anchorValue = this.config.get<string>('STANDARD_WEEK1_ANCHOR');
    if (!anchorValue) throw new Error('STANDARD_WEEK1_ANCHOR is required');

    const anchor = this.startOfWeek(this.toDateOnly(new Date(anchorValue)));
    const currentMonday = this.startOfWeek(asOf);
    const diffWeeks = Math.floor((currentMonday.getTime() - anchor.getTime()) / 604800000);
    const normalizedParity = ((diffWeeks % 2) + 2) % 2;
    const currentSlot = normalizedParity === 0 ? 1 : 2;

    let start = currentMonday;
    if (currentSlot !== maintenanceWeek) start = this.addDays(currentMonday, -7);

    return { start, end: this.addDays(start, 6) };
  }

  private previousStandardWindow(currentStart: Date) {
    const start = this.addDays(currentStart, -14);
    return { start, end: this.addDays(start, 6) };
  }

  private countMissedStandardPeriods(lastValid: Date | null, currentStart: Date, maintenanceWeek: number) {
    if (!lastValid) return 1;
    const last = this.toDateOnly(lastValid);
    let count = 0;
    let cursor = this.addDays(currentStart, -14);
    while (cursor > last && count < 52) {
      count += 1;
      cursor = this.addDays(cursor, -14);
    }
    return count;
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
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
}
