import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttemptReviewStatus, MaintenanceType, PointStatus, VisitStatus } from '@prisma/client';
import { businessWeek } from '../common/business-week';
import { dateOnlyForBusinessDate } from '../common/business-time';
import { nextSmartcleanDueDate } from '../common/smartclean-schedule';
import { PrismaService } from '../prisma/prisma.service';

export type EffectiveSmartcleanWorkloadItem = {
  pointId: string;
  regionId: string | null;
  maintenanceWeek: number;
  dueStart: Date;
  state: 'CURRENT' | 'CARRYOVER';
};

@Injectable()
export class EffectiveWorkloadService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async smartcleanForWeek(asOf = new Date()): Promise<EffectiveSmartcleanWorkloadItem[]> {
    const week = businessWeek(asOf);
    const anchor = this.week1Anchor();
    if (!anchor) return [];
    const points = await this.prisma.point.findMany({
      where: { status: PointStatus.ACTIVE, deletedAt: null, maintenanceType: MaintenanceType.SMARTCLEAN },
      select: {
        id: true, regionId: true, maintenanceWeek: true, smartcleanReferenceAt: true,
        visits: {
          where: { status: VisitStatus.VALID, performedAt: { lt: week.startInstant } },
          orderBy: { performedAt: 'desc' }, take: 1, select: { performedAt: true },
        },
        attempts: {
          where: {
            reviewStatus: AttemptReviewStatus.APPROVED,
            closedDueDate: { not: null },
            reviewedAt: { lt: week.startInstant },
          },
          orderBy: { reviewedAt: 'desc' }, take: 1, select: { closedDueDate: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    return points.flatMap((point) => {
      if (![1, 2].includes(point.maintenanceWeek ?? 0)) return [];
      const base = point.visits[0]?.performedAt ?? point.smartcleanReferenceAt;
      if (!base) return [];
      const dueStart = nextSmartcleanDueDate(
        dateOnlyForBusinessDate(base),
        point.maintenanceWeek!,
        anchor,
        point.attempts[0]?.closedDueDate ?? null,
      );
      if (dueStart > week.weekEnd) return [];
      return [{
        pointId: point.id,
        regionId: point.regionId,
        maintenanceWeek: point.maintenanceWeek!,
        dueStart,
        state: dueStart < week.weekStart ? 'CARRYOVER' as const : 'CURRENT' as const,
      }];
    });
  }

  smartcleanScheduleConfigured() {
    return Boolean(this.week1Anchor());
  }

  private week1Anchor() {
    const value = this.config.get<string>('STANDARD_WEEK1_ANCHOR');
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return dateOnlyForBusinessDate(parsed);
  }
}
