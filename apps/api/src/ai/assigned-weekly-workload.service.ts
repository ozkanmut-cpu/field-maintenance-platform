import { Injectable } from '@nestjs/common';
import { MaintenanceObligationStatus, MaintenanceType, PointStatus } from '@prisma/client';
import { AssignmentsService } from '../assignments/assignments.service';
import { businessWeek } from '../common/business-week';
import { PrismaService } from '../prisma/prisma.service';
import { EffectiveWorkloadService } from './effective-workload.service';
import { GeographyService, GeoPoint } from './geography.service';
import { GeographyClusteringService } from './geography-clustering.service';
import { estimateServiceEffort } from './service-effort';

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
  assignedServiceEffortMinMinutes: number;
  assignedServiceEffortMaxMinutes: number;
  assignedServiceEffortMidpointMinutes: number;
  assignedLocatedPointCount: number;
  assignedUnlocatedPointCount: number;
  assignedFieldP90RadiusMeters: number | null;
  assignedRouteEstimateMeters: number | null;
  assignedRouteCoherenceRatio: number | null;
  assignedClusterCount: number;
  assignedIsolatedPointCount: number;
  assignedFragmentationRatio: number | null;
  workAreaCenterDistanceMeters: number | null;
  currentWeekSuspiciousVisitCount?: number;
  currentWeekReviewRecommendedCount?: number;
  currentWeekPaperworkPendingCount?: number;
};

@Injectable()
export class AssignedWeeklyWorkloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
    private readonly effectiveWorkload: EffectiveWorkloadService,
    private readonly geography: GeographyService,
    private readonly clustering: GeographyClusteringService,
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
    const [effective, pointProfiles, currentWeekVisits] = await Promise.all([
      this.assignments.resolveMany(pointIds, asOf),
      pointIds.length
        ? this.prisma.point.findMany({
            where: { id: { in: pointIds } },
            select: { id: true, coolerCount: true, towerCount: true, tapCount: true, smarttapCount: true, canonicalLatitude: true, canonicalLongitude: true },
          })
        : [],
      this.prisma.maintenanceVisit.findMany({
        where: { status: 'VALID', performedAt: { gte: week.startInstant, lt: week.endExclusiveInstant } },
        select: { technicianId: true, performedAt: true, suspiciousBatch: true, reviewRecommended: true, serviceSlipStatus: true, confirmationStatus: true, paperworkHistory: { where: { changedAt: { lt: week.endExclusiveInstant } }, select: { kind: true, newStatus: true, changedAt: true }, orderBy: { changedAt: 'asc' } } },
      }),
    ]);
    const profileByPoint = new Map(pointProfiles.map((point) => [point.id, point]));
    const rows = new Map<string, TechnicianAssignedWeeklyWorkload>();
    const unassigned = { standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0 };
    const seenProfiles = new Set<string>();
    const locatedByTechnician = new Map<string, Array<GeoPoint & { id: string }>>();

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
        assignedServiceEffortMinMinutes: 0,
        assignedServiceEffortMaxMinutes: 0,
        assignedServiceEffortMidpointMinutes: 0,
        assignedLocatedPointCount: 0,
        assignedUnlocatedPointCount: 0,
        assignedFieldP90RadiusMeters: null,
        assignedRouteEstimateMeters: null,
        assignedRouteCoherenceRatio: null,
        assignedClusterCount: 0,
        assignedIsolatedPointCount: 0,
        assignedFragmentationRatio: null,
        workAreaCenterDistanceMeters: null,
        currentWeekSuspiciousVisitCount: 0,
        currentWeekReviewRecommendedCount: 0,
        currentWeekPaperworkPendingCount: 0,
      };
      rows.set(technicianId, row);
      return row;
    };

    const add = (pointId: string, key: keyof typeof unassigned) => {
      const technicianId = effective.get(pointId)?.technicianId ?? null;
      if (!technicianId) return void (unassigned[key] += 1);
      const row = rowFor(technicianId);
      row[key] += 1;
      if (seenProfiles.has(pointId)) return;
      seenProfiles.add(pointId);
      const profile = profileByPoint.get(pointId);
      const complete = profile && [profile.coolerCount, profile.towerCount, profile.tapCount, profile.smarttapCount].every((value) => value !== null);
      if (!complete || !profile) row.equipmentUnknownPointCount += 1;
      else {
        row.equipmentKnownPointCount += 1;
        row.assignedCoolerCount += profile.coolerCount ?? 0;
        row.assignedTowerCount += profile.towerCount ?? 0;
        row.assignedTapCount += profile.tapCount ?? 0;
        row.assignedSmarttapCount += profile.smarttapCount ?? 0;
        const effort = estimateServiceEffort(profile.towerCount);
        row.assignedServiceEffortMinMinutes += effort.minMinutes ?? 0;
        row.assignedServiceEffortMaxMinutes += effort.maxMinutes ?? 0;
        row.assignedServiceEffortMidpointMinutes += effort.midpointMinutes ?? 0;
      }
      if (profile?.canonicalLatitude !== null && profile?.canonicalLatitude !== undefined && profile?.canonicalLongitude !== null && profile?.canonicalLongitude !== undefined) {
        row.assignedLocatedPointCount += 1;
        const points = locatedByTechnician.get(technicianId) ?? [];
        points.push({ id: pointId, latitude: Number(profile.canonicalLatitude), longitude: Number(profile.canonicalLongitude) });
        locatedByTechnician.set(technicianId, points);
      } else row.assignedUnlocatedPointCount += 1;
    };

    for (const item of standard) add(item.pointId, item.dueEnd < week.weekStart ? 'standardCarryover' : 'standardCurrent');
    for (const item of smartclean) add(item.pointId, item.state === 'CARRYOVER' ? 'smartcleanCarryover' : 'smartcleanCurrent');

    const visitMetrics = new Map<string, { suspicious: number; review: number; pending: number }>();
    for (const visit of currentWeekVisits) {
      const metric = visitMetrics.get(visit.technicianId) ?? { suspicious: 0, review: 0, pending: 0 };
      if (visit.suspiciousBatch) metric.suspicious += 1;
      if (visit.reviewRecommended) metric.review += 1;
      if (visit.serviceSlipStatus !== 'PRESENT') metric.pending += 1;
      if (visit.confirmationStatus !== 'PRESENT') metric.pending += 1;
      visitMetrics.set(visit.technicianId, metric);
    }

    for (const row of rows.values()) {
      const points = locatedByTechnician.get(row.technicianId) ?? [];
      const summary = this.geography.summarize(points);
      row.assignedFieldP90RadiusMeters = points.length ? summary.p90RadiusMeters : null;
      row.assignedRouteEstimateMeters = points.length ? this.geography.estimateOpenRouteMeters(points) : null;
      row.assignedRouteCoherenceRatio = points.length ? this.geography.routeCoherenceRatio(points) : null;
      if (points.length) {
        const clustered = this.clustering.clusterAdaptive(points);
        row.assignedClusterCount = clustered.clusterCount;
        row.assignedIsolatedPointCount = clustered.isolatedPointCount;
        row.assignedFragmentationRatio = clustered.fragmentationRatio;
        const workArea = await this.geography.technicianWorkProfile(row.technicianId, 90, asOf);
        if (summary.centerLatitude !== null && summary.centerLongitude !== null && workArea.centerLatitude !== null && workArea.centerLongitude !== null) {
          row.workAreaCenterDistanceMeters = this.geography.distanceMeters(
            { latitude: summary.centerLatitude, longitude: summary.centerLongitude },
            { latitude: workArea.centerLatitude, longitude: workArea.centerLongitude },
          );
        }
      }
      const metrics = visitMetrics.get(row.technicianId);
      if (metrics) {
        row.currentWeekSuspiciousVisitCount = metrics.suspicious;
        row.currentWeekReviewRecommendedCount = metrics.review;
        row.currentWeekPaperworkPendingCount = metrics.pending;
      }
    }

    return { weekKey: week.key, technicians: [...rows.values()].sort((a, b) => a.technicianId.localeCompare(b.technicianId)), unassigned };
  }
}
