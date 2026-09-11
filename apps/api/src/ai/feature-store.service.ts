import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PointStatus, UserRole, VisitStatus } from '@prisma/client';
import { businessWeek } from '../common/business-week';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureRecord, FeatureSnapshot } from './feature-store.types';
import { EffectiveWorkloadService } from './effective-workload.service';

@Injectable()
export class FeatureStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectiveWorkload: EffectiveWorkloadService,
  ) {}

  async buildWeeklySnapshot(asOf = new Date()): Promise<FeatureSnapshot> {
    const week = businessWeek(asOf);
    const smartcleanScheduleConfigured = this.effectiveWorkload.smartcleanScheduleConfigured();
    const smartcleanWorkload = await this.effectiveWorkload.smartcleanForWeek(asOf);
    const [technicians, regions, points, visits, attempts, obligations] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: UserRole.TECHNICIAN, active: true },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.region.findMany({
        select: { id: true, name: true, technicianId: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.point.findMany({
        where: { status: PointStatus.ACTIVE, deletedAt: null },
        select: {
          id: true, regionId: true, maintenanceType: true, maintenanceWeek: true,
          canonicalLatitude: true, canonicalLongitude: true, locationConfidence: true,
          locationSource: true, updatedAt: true,
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.maintenanceVisit.findMany({
        where: {
          status: VisitStatus.VALID,
          performedAt: { gte: week.startInstant, lt: week.endExclusiveInstant },
        },
        select: {
          id: true, pointId: true, technicianId: true, assistedForTechnicianId: true,
          performedAt: true, recordedAtServer: true, enteredLate: true,
          suspiciousBatch: true, reviewRecommended: true, latitude: true, longitude: true,
          accuracyMeters: true,
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.maintenanceAttempt.findMany({
        where: { attemptedAt: { gte: week.startInstant, lt: week.endExclusiveInstant } },
        select: { id: true, pointId: true, technicianId: true, attemptedAt: true, reviewStatus: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.maintenanceObligation.findMany({
        where: { dueStart: { lte: week.weekEnd }, dueEnd: { gte: week.weekStart } },
        select: { id: true, pointId: true, status: true, dueStart: true, dueEnd: true, createdAt: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    const records: FeatureRecord[] = [];
    records.push({
      entityType: 'SYSTEM', entityId: 'SYSTEM', features: {
        activeTechnicianCount: technicians.length,
        regionCount: regions.length,
        activePointCount: points.length,
        locatedPointCount: points.filter((p) => p.canonicalLatitude && p.canonicalLongitude).length,
        visitCount: visits.length,
        attemptCount: attempts.length,
        obligationCount: obligations.length,
        smartcleanScheduleConfigured,
        smartcleanCurrentWorkloadCount: smartcleanWorkload.filter((x) => x.state === 'CURRENT').length,
        smartcleanCarryoverWorkloadCount: smartcleanWorkload.filter((x) => x.state === 'CARRYOVER').length,
      },
    });

    for (const technician of technicians) {
      const technicianVisits = visits.filter((v) => v.technicianId === technician.id);
      const technicianAttempts = attempts.filter((a) => a.technicianId === technician.id);
      records.push({ entityType: 'TECHNICIAN', entityId: technician.id, features: {
        assignedRegionCount: regions.filter((r) => r.technicianId === technician.id).length,
        completedVisitCount: technicianVisits.length,
        attemptedVisitCount: technicianAttempts.length,
        uniqueVisitedPointCount: new Set(technicianVisits.map((v) => v.pointId)).size,
        assistedVisitCount: technicianVisits.filter((v) => v.assistedForTechnicianId).length,
        lateEntryCount: technicianVisits.filter((v) => v.enteredLate).length,
        suspiciousVisitCount: technicianVisits.filter((v) => v.suspiciousBatch).length,
        reviewRecommendedCount: technicianVisits.filter((v) => v.reviewRecommended).length,
        gpsSampleCount: technicianVisits.filter((v) => v.latitude && v.longitude).length,
      }});
    }

    for (const region of regions) {
      const regionPointIds = new Set(points.filter((p) => p.regionId === region.id).map((p) => p.id));
      records.push({ entityType: 'REGION', entityId: region.id, features: {
        assignedTechnicianId: region.technicianId,
        technicianAssigned: Boolean(region.technicianId),
        pointCount: regionPointIds.size,
        locatedPointCount: points.filter((p) => p.regionId === region.id && p.canonicalLatitude && p.canonicalLongitude).length,
        visitCount: visits.filter((v) => regionPointIds.has(v.pointId)).length,
        attemptCount: attempts.filter((a) => regionPointIds.has(a.pointId)).length,
        smartcleanScheduleConfigured,
        smartcleanCurrentWorkloadCount: smartcleanWorkload.filter((x) => x.regionId === region.id && x.state === 'CURRENT').length,
        smartcleanCarryoverWorkloadCount: smartcleanWorkload.filter((x) => x.regionId === region.id && x.state === 'CARRYOVER').length,
      }});
    }

    for (const point of points) {
      const pointVisits = visits.filter((v) => v.pointId === point.id);
      const pointAttempts = attempts.filter((a) => a.pointId === point.id);
      const pointObligations = obligations.filter((o) => o.pointId === point.id);
      records.push({ entityType: 'POINT', entityId: point.id, features: {
        regionId: point.regionId,
        hasRegion: Boolean(point.regionId),
        hasCanonicalLocation: Boolean(point.canonicalLatitude && point.canonicalLongitude),
        locationConfidence: point.locationConfidence,
        locationSource: point.locationSource,
        maintenanceType: point.maintenanceType,
        maintenanceWeek: point.maintenanceWeek,
        visitCount: pointVisits.length,
        attemptCount: pointAttempts.length,
        obligationCount: pointObligations.length,
        completedObligationCount: pointObligations.filter((o) => o.status === 'COMPLETED').length,
        missedObligationCount: pointObligations.filter((o) => o.status === 'MISSED').length,
        smartcleanDueThisWeek: smartcleanWorkload.some((x) => x.pointId === point.id && x.state === 'CURRENT'),
        smartcleanCarryover: smartcleanWorkload.some((x) => x.pointId === point.id && x.state === 'CARRYOVER'),
      }});
    }

    const sourcePayload = { technicians, regions, points, visits, attempts, obligations, smartcleanScheduleConfigured, smartcleanWorkload };
    const sourceHash = createHash('sha256').update(this.stableStringify(sourcePayload)).digest('hex');
    const timestamps = [
      ...technicians.map((x) => x.updatedAt), ...regions.map((x) => x.updatedAt), ...points.map((x) => x.updatedAt),
      ...visits.map((x) => x.recordedAtServer), ...attempts.map((x) => x.attemptedAt), ...obligations.map((x) => x.createdAt),
    ];
    const sourceDataThrough = timestamps.length
      ? new Date(Math.max(...timestamps.map((d) => d.getTime()))).toISOString()
      : null;

    records.sort((a, b) => `${a.entityType}:${a.entityId}`.localeCompare(`${b.entityType}:${b.entityId}`));
    return {
      weekKey: week.key, isoYear: week.isoYear, isoWeek: week.isoWeek,
      weekStart: week.weekStart.toISOString().slice(0, 10),
      weekEnd: week.weekEnd.toISOString().slice(0, 10),
      startInstant: week.startInstant.toISOString(),
      endExclusiveInstant: week.endExclusiveInstant.toISOString(),
      sourceDataThrough, sourceHash, generatedAt: new Date().toISOString(), records,
    };
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return `[${value.map((v) => this.stableStringify(v)).join(',')}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(object[key])}`).join(',')}}`;
  }
}
