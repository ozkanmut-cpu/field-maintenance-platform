import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationSource, Prisma, VisitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Evidence = {
  id: string;
  technicianId: string;
  performedAt: Date;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  accuracyMeters: Prisma.Decimal | null;
};

@Injectable()
export class PointLocationLearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async refreshPoint(pointId: string) {
    const point = await this.prisma.point.findFirst({
      where: { id: pointId, deletedAt: null },
      select: {
        id: true,
        canonicalLatitude: true,
        canonicalLongitude: true,
        locationSource: true,
        locationConfidence: true,
      },
    });
    if (!point) return { pointId, updated: false, reason: 'POINT_NOT_FOUND' };

    // Strong/manual sources are never silently overwritten by field evidence.
    if ([LocationSource.MANUAL, LocationSource.GOOGLE_MATCH].includes(point.locationSource)) {
      return { pointId, updated: false, reason: 'PROTECTED_SOURCE' };
    }

    const maxAccuracyMeters = this.numberConfig('LOCATION_MAX_ACCURACY_METERS', 80);
    const clusterRadiusMeters = this.numberConfig('LOCATION_CLUSTER_RADIUS_METERS', 120);

    const visits = await this.prisma.maintenanceVisit.findMany({
      where: {
        pointId,
        status: VisitStatus.VALID,
        locationLearningEligible: true,
        suspiciousBatch: false,
        enteredLate: false,
      },
      orderBy: { performedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        technicianId: true,
        performedAt: true,
        latitude: true,
        longitude: true,
        accuracyMeters: true,
      },
    });

    const usable = visits.filter((visit) => {
      if (visit.accuracyMeters === null) return true;
      return Number(visit.accuracyMeters) <= maxAccuracyMeters;
    });

    if (usable.length < 2) {
      return {
        pointId,
        updated: false,
        reason: 'INSUFFICIENT_EVIDENCE',
        evidenceCount: usable.length,
      };
    }

    const cluster = this.bestCluster(usable, clusterRadiusMeters);
    const distinctDays = new Set(cluster.map((item) => this.dateKey(item.performedAt))).size;
    const distinctTechnicians = new Set(cluster.map((item) => item.technicianId)).size;

    // At least two independent visits are required. Two same-day entries from the
    // same technician are not enough to establish a canonical point location.
    if (cluster.length < 2 || (distinctDays < 2 && distinctTechnicians < 2)) {
      return {
        pointId,
        updated: false,
        reason: 'INSUFFICIENT_INDEPENDENT_EVIDENCE',
        evidenceCount: cluster.length,
        distinctDays,
        distinctTechnicians,
      };
    }

    const latitude = this.median(cluster.map((item) => Number(item.latitude)));
    const longitude = this.median(cluster.map((item) => Number(item.longitude)));
    const confidence = this.confidence(cluster.length, distinctDays, distinctTechnicians);

    const updated = await this.prisma.point.update({
      where: { id: pointId },
      data: {
        canonicalLatitude: new Prisma.Decimal(latitude.toFixed(6)),
        canonicalLongitude: new Prisma.Decimal(longitude.toFixed(6)),
        locationSource: LocationSource.FIELD_CONFIRMED,
        locationConfidence: confidence,
      },
      select: {
        id: true,
        canonicalLatitude: true,
        canonicalLongitude: true,
        locationSource: true,
        locationConfidence: true,
      },
    });

    return {
      pointId,
      updated: true,
      evidenceCount: cluster.length,
      distinctDays,
      distinctTechnicians,
      maxAccuracyMeters,
      clusterRadiusMeters,
      point: updated,
    };
  }

  async refreshEligiblePoints(limit = 100) {
    const points = await this.prisma.point.findMany({
      where: {
        deletedAt: null,
        locationSource: { in: [LocationSource.UNKNOWN, LocationSource.FIELD_CONFIRMED] },
      },
      select: { id: true },
      take: Math.min(Math.max(limit, 1), 500),
    });

    const results = [];
    for (const point of points) results.push(await this.refreshPoint(point.id));
    return { scannedPoints: points.length, results };
  }

  private bestCluster(visits: Evidence[], radiusMeters: number) {
    let best: Evidence[] = [];
    for (const anchor of visits) {
      const cluster = visits.filter((candidate) => this.distanceMeters(anchor, candidate) <= radiusMeters);
      if (cluster.length > best.length) best = cluster;
    }
    return best;
  }

  private confidence(evidenceCount: number, distinctDays: number, distinctTechnicians: number) {
    if (evidenceCount >= 5 && distinctDays >= 3 && distinctTechnicians >= 2) return 100;
    if (evidenceCount >= 3 && (distinctDays >= 3 || distinctTechnicians >= 2)) return 75;
    return 50;
  }

  private numberConfig(name: string, fallback: number) {
    const raw = this.config.get<string>(name);
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  }

  private distanceMeters(a: Evidence, b: Evidence) {
    const lat1 = Number(a.latitude) * (Math.PI / 180);
    const lat2 = Number(b.latitude) * (Math.PI / 180);
    const deltaLat = lat2 - lat1;
    const deltaLon = (Number(b.longitude) - Number(a.longitude)) * (Math.PI / 180);
    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
