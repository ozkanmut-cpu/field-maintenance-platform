import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PointStatus, UserRole, VisitStatus } from '@prisma/client';
import { businessWeek } from '../common/business-week';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureRecord, FeatureSnapshot } from './feature-store.types';
import { EffectiveWorkloadService } from './effective-workload.service';
import { GeographyService } from './geography.service';
import { GeographyClusteringService } from './geography-clustering.service';

@Injectable()
export class FeatureStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectiveWorkload: EffectiveWorkloadService,
    private readonly geography: GeographyService,
    private readonly clustering: GeographyClusteringService,
  ) {}

  async buildWeeklySnapshot(asOf = new Date()): Promise<FeatureSnapshot> {
    const week = businessWeek(asOf);
    const smartcleanScheduleConfigured = this.effectiveWorkload.smartcleanScheduleConfigured();
    const smartcleanWorkload = await this.effectiveWorkload.smartcleanForWeek(asOf);
    const [technicians, regions, points, visits, attempts, obligations] = await Promise.all([
      this.prisma.user.findMany({ where: { role: UserRole.TECHNICIAN, active: true }, select: { id: true, name: true, createdAt: true, updatedAt: true }, orderBy: { id: 'asc' } }),
      this.prisma.region.findMany({ select: { id: true, name: true, technicianId: true, updatedAt: true }, orderBy: { id: 'asc' } }),
      this.prisma.point.findMany({ where: { status: PointStatus.ACTIVE, deletedAt: null }, select: { id: true, regionId: true, maintenanceType: true, maintenanceWeek: true, canonicalLatitude: true, canonicalLongitude: true, locationConfidence: true, locationSource: true, coolerCount: true, towerCount: true, tapCount: true, smarttapCount: true, updatedAt: true }, orderBy: { id: 'asc' } }),
      this.prisma.maintenanceVisit.findMany({ where: { status: VisitStatus.VALID, performedAt: { gte: week.startInstant, lt: week.endExclusiveInstant } }, select: { id: true, pointId: true, technicianId: true, assistedForTechnicianId: true, performedAt: true, recordedAtServer: true, enteredLate: true, suspiciousBatch: true, reviewRecommended: true, latitude: true, longitude: true, accuracyMeters: true }, orderBy: { id: 'asc' } }),
      this.prisma.maintenanceAttempt.findMany({ where: { attemptedAt: { gte: week.startInstant, lt: week.endExclusiveInstant } }, select: { id: true, pointId: true, technicianId: true, attemptedAt: true, reviewStatus: true }, orderBy: { id: 'asc' } }),
      this.prisma.maintenanceObligation.findMany({ where: { dueStart: { lte: week.weekEnd }, dueEnd: { gte: week.weekStart } }, select: { id: true, pointId: true, status: true, dueStart: true, dueEnd: true, createdAt: true }, orderBy: { id: 'asc' } }),
    ]);

    const locatedPoints = points.filter((p) => p.canonicalLatitude !== null && p.canonicalLongitude !== null).map((p) => ({ id: p.id, latitude: Number(p.canonicalLatitude), longitude: Number(p.canonicalLongitude) }));
    const systemClusters = this.clustering.clusterAdaptive(locatedPoints);
    const regionClusters = new Map(regions.map((region) => {
      const regionLocated = locatedPoints.filter((p) => points.find((source) => source.id === p.id)?.regionId === region.id);
      return [region.id, this.clustering.clusterAdaptive(regionLocated)] as const;
    }));
    const pointClusterMembership = new Map<string, { clusterId: string | null; isolated: boolean }>();
    for (const [regionId, result] of regionClusters) {
      for (const cluster of result.clusters) for (const pointId of cluster.pointIds) pointClusterMembership.set(pointId, { clusterId: `${regionId}:${cluster.id}`, isolated: false });
      for (const pointId of result.isolatedPointIds) pointClusterMembership.set(pointId, { clusterId: null, isolated: true });
    }
    const nearestNeighborMeters = new Map<string, number | null>();
    for (const point of locatedPoints) {
      const regionId = points.find((source) => source.id === point.id)?.regionId ?? null;
      const peers = locatedPoints.filter((candidate) => candidate.id !== point.id && (points.find((source) => source.id === candidate.id)?.regionId ?? null) === regionId);
      nearestNeighborMeters.set(point.id, peers.length ? Math.min(...peers.map((peer) => this.geography.distanceMeters(point, peer))) : null);
    }

    const records: FeatureRecord[] = [];
    records.push({ entityType: 'SYSTEM', entityId: 'SYSTEM', features: {
      activeTechnicianCount: technicians.length,
      regionCount: regions.length,
      activePointCount: points.length,
      equipmentProfileCompleteCount: points.filter((p) => [p.coolerCount, p.towerCount, p.tapCount, p.smarttapCount].every((v) => v !== null)).length,
      equipmentProfileCoverage: points.length ? points.filter((p) => [p.coolerCount, p.towerCount, p.tapCount, p.smarttapCount].every((v) => v !== null)).length / points.length : 0,
      locatedPointCount: locatedPoints.length,
      visitCount: visits.length,
      attemptCount: attempts.length,
      obligationCount: obligations.length,
      smartcleanScheduleConfigured,
      smartcleanCurrentWorkloadCount: smartcleanWorkload.filter((x) => x.state === 'CURRENT').length,
      smartcleanCarryoverWorkloadCount: smartcleanWorkload.filter((x) => x.state === 'CARRYOVER').length,
      geographicClusterCount: systemClusters.clusterCount,
      geographicIsolatedPointCount: systemClusters.isolatedPointCount,
      geographicLargestClusterShare: systemClusters.largestClusterShare,
      geographicFragmentationRatio: systemClusters.fragmentationRatio,
      geographicAdaptiveLinkMeters: systemClusters.adaptiveLinkMeters,
    }});

    for (const technician of technicians) {
      const technicianVisits = visits.filter((v) => v.technicianId === technician.id);
      const technicianAttempts = attempts.filter((a) => a.technicianId === technician.id);
      const technicianGeo = this.geography.summarize(technicianVisits.filter((v) => v.latitude !== null && v.longitude !== null).map((v) => ({ latitude: Number(v.latitude), longitude: Number(v.longitude) })));
      records.push({ entityType: 'TECHNICIAN', entityId: technician.id, features: {
        assignedRegionCount: regions.filter((r) => r.technicianId === technician.id).length,
        completedVisitCount: technicianVisits.length,
        attemptedVisitCount: technicianAttempts.length,
        uniqueVisitedPointCount: new Set(technicianVisits.map((v) => v.pointId)).size,
        assistedVisitCount: technicianVisits.filter((v) => v.assistedForTechnicianId).length,
        lateEntryCount: technicianVisits.filter((v) => v.enteredLate).length,
        suspiciousVisitCount: technicianVisits.filter((v) => v.suspiciousBatch).length,
        reviewRecommendedCount: technicianVisits.filter((v) => v.reviewRecommended).length,
        gpsSampleCount: technicianGeo.sampleCount,
        fieldCenterLatitude: technicianGeo.centerLatitude,
        fieldCenterLongitude: technicianGeo.centerLongitude,
        fieldP90RadiusMeters: technicianGeo.p90RadiusMeters,
      }});
    }

    for (const region of regions) {
      const regionPoints = points.filter((p) => p.regionId === region.id);
      const regionPointIds = new Set(regionPoints.map((p) => p.id));
      const regionGeo = this.geography.summarize(regionPoints.filter((p) => p.canonicalLatitude !== null && p.canonicalLongitude !== null).map((p) => ({ latitude: Number(p.canonicalLatitude), longitude: Number(p.canonicalLongitude) })));
      const regionCluster = regionClusters.get(region.id)!;
      records.push({ entityType: 'REGION', entityId: region.id, features: {
        assignedTechnicianId: region.technicianId,
        technicianAssigned: Boolean(region.technicianId),
        pointCount: regionPointIds.size,
        locatedPointCount: regionGeo.sampleCount,
        locationCoverage: regionPoints.length ? regionGeo.sampleCount / regionPoints.length : 0,
        centerLatitude: regionGeo.centerLatitude,
        centerLongitude: regionGeo.centerLongitude,
        p90RadiusMeters: regionGeo.p90RadiusMeters,
        maxRadiusMeters: regionGeo.maxRadiusMeters,
        geographicClusterCount: regionCluster.clusterCount,
        geographicIsolatedPointCount: regionCluster.isolatedPointCount,
        geographicLargestClusterShare: regionCluster.largestClusterShare,
        geographicFragmentationRatio: regionCluster.fragmentationRatio,
        geographicAdaptiveLinkMeters: regionCluster.adaptiveLinkMeters,
        nearestNeighborP50Meters: regionCluster.nearestNeighborP50Meters,
        nearestNeighborP90Meters: regionCluster.nearestNeighborP90Meters,
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
      const clusterMembership = pointClusterMembership.get(point.id);
      records.push({ entityType: 'POINT', entityId: point.id, features: {
        regionId: point.regionId,
        hasRegion: Boolean(point.regionId),
        hasCanonicalLocation: point.canonicalLatitude !== null && point.canonicalLongitude !== null,
        canonicalLatitude: point.canonicalLatitude === null ? null : Number(point.canonicalLatitude),
        canonicalLongitude: point.canonicalLongitude === null ? null : Number(point.canonicalLongitude),
        geographicClusterId: clusterMembership?.clusterId ?? null,
        geographicIsolated: clusterMembership?.isolated ?? false,
        nearestNeighborMeters: nearestNeighborMeters.get(point.id) ?? null,
        locationConfidence: point.locationConfidence,
        locationSource: point.locationSource,
        maintenanceType: point.maintenanceType,
        maintenanceWeek: point.maintenanceWeek,
        coolerCount: point.coolerCount,
        towerCount: point.towerCount,
        tapCount: point.tapCount,
        smarttapCount: point.smarttapCount,
        equipmentProfileComplete: [point.coolerCount, point.towerCount, point.tapCount, point.smarttapCount].every((v) => v !== null),
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
    const timestamps = [...technicians.map((x) => x.updatedAt), ...regions.map((x) => x.updatedAt), ...points.map((x) => x.updatedAt), ...visits.map((x) => x.recordedAtServer), ...attempts.map((x) => x.attemptedAt), ...obligations.map((x) => x.createdAt)];
    const sourceDataThrough = timestamps.length ? new Date(Math.max(...timestamps.map((d) => d.getTime()))).toISOString() : null;
    records.sort((a, b) => `${a.entityType}:${a.entityId}`.localeCompare(`${b.entityType}:${b.entityId}`));
    return { weekKey: week.key, isoYear: week.isoYear, isoWeek: week.isoWeek, weekStart: week.weekStart.toISOString().slice(0, 10), weekEnd: week.weekEnd.toISOString().slice(0, 10), startInstant: week.startInstant.toISOString(), endExclusiveInstant: week.endExclusiveInstant.toISOString(), sourceDataThrough, sourceHash, generatedAt: new Date().toISOString(), records };
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return `[${value.map((v) => this.stableStringify(v)).join(',')}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(object[key])}`).join(',')}}`;
  }
}
