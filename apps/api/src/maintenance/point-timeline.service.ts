import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PointTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async get(pointId: string, limit = 200) {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 20), 500) : 200;
    const point = await this.prisma.point.findFirst({
      where: { id: pointId, deletedAt: null },
      select: { id: true, code: true, name: true, maintenanceType: true, region: { select: { id: true, name: true } } },
    });
    if (!point) throw new NotFoundException('Nokta bulunamadı');

    const [visits, attempts, otherVisits, obligations, assignments] = await Promise.all([
      this.prisma.maintenanceVisit.findMany({
        where: { pointId },
        select: {
          id: true, performedAt: true, recordedAtServer: true, status: true, enteredLate: true,
          serviceSlipStatus: true, confirmationStatus: true, reviewRecommended: true, reviewReason: true,
          sitePresenceConfirmed: true, sitePresenceDistanceM: true, coolerCount: true, towerCount: true,
          tapCount: true, smarttapCount: true,
          technician: { select: { id: true, name: true, username: true } },
        },
        orderBy: { performedAt: 'desc' }, take: safeLimit,
      }),
      this.prisma.maintenanceAttempt.findMany({
        where: { pointId },
        select: {
          id: true, attemptedAt: true, reason: true, note: true, reviewStatus: true, reviewedAt: true,
          reviewNote: true, closedDueDate: true,
          technician: { select: { id: true, name: true, username: true } },
          reviewedBy: { select: { id: true, name: true, username: true } },
        },
        orderBy: { attemptedAt: 'desc' }, take: safeLimit,
      }),
      this.prisma.nonMaintenanceVisit.findMany({
        where: { pointId },
        select: {
          id: true, visitedAt: true, purpose: true, note: true,
          technician: { select: { id: true, name: true, username: true } },
        },
        orderBy: { visitedAt: 'desc' }, take: safeLimit,
      }),
      this.prisma.maintenanceObligation.findMany({
        where: { pointId },
        select: { id: true, cycleKey: true, dueStart: true, dueEnd: true, status: true, completedAt: true, resolvedAt: true, resolvedByVisitId: true, resolvedByAttemptId: true, createdAt: true },
        orderBy: { dueStart: 'desc' }, take: safeLimit,
      }),
      this.prisma.pointAssignment.findMany({
        where: { pointId },
        select: {
          id: true, kind: true, startsAt: true, endsAt: true, active: true, reason: true, createdAt: true, deactivatedAt: true,
          technician: { select: { id: true, name: true, username: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { startsAt: 'desc' }, take: safeLimit,
      }),
    ]);

    const items = [
      ...visits.map((item) => ({ type: 'MAINTENANCE' as const, at: item.performedAt, id: item.id, data: item })),
      ...attempts.map((item) => ({ type: 'ATTEMPT' as const, at: item.attemptedAt, id: item.id, data: item })),
      ...otherVisits.map((item) => ({ type: 'NON_MAINTENANCE_VISIT' as const, at: item.visitedAt, id: item.id, data: item })),
      ...obligations.map((item) => ({ type: 'OBLIGATION' as const, at: item.resolvedAt ?? item.completedAt ?? item.dueStart, id: item.id, data: item })),
      ...assignments.map((item) => ({ type: 'ASSIGNMENT' as const, at: item.deactivatedAt ?? item.startsAt, id: item.id, data: item })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, safeLimit);

    return {
      point,
      counts: {
        maintenance: visits.length,
        attempts: attempts.length,
        nonMaintenanceVisits: otherVisits.length,
        obligations: obligations.length,
        assignments: assignments.length,
      },
      items,
    };
  }
}
