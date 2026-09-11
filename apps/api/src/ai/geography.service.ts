import { Injectable } from '@nestjs/common';
import { PointStatus, VisitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type GeoPoint = { latitude: number; longitude: number };
export type GeoSummary = {
  sampleCount: number;
  centerLatitude: number | null;
  centerLongitude: number | null;
  p50RadiusMeters: number | null;
  p90RadiusMeters: number | null;
  maxRadiusMeters: number | null;
};

@Injectable()
export class GeographyService {
  constructor(private readonly prisma: PrismaService) {}

  distanceMeters(a: GeoPoint, b: GeoPoint) {
    const lat1 = this.rad(a.latitude);
    const lat2 = this.rad(b.latitude);
    const dLat = lat2 - lat1;
    const dLon = this.rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  summarize(points: GeoPoint[]): GeoSummary {
    if (!points.length) return { sampleCount: 0, centerLatitude: null, centerLongitude: null, p50RadiusMeters: null, p90RadiusMeters: null, maxRadiusMeters: null };
    const center = {
      latitude: points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
      longitude: points.reduce((sum, p) => sum + p.longitude, 0) / points.length,
    };
    const radii = points.map((p) => this.distanceMeters(center, p)).sort((a, b) => a - b);
    return {
      sampleCount: points.length,
      centerLatitude: center.latitude,
      centerLongitude: center.longitude,
      p50RadiusMeters: this.percentile(radii, 0.5),
      p90RadiusMeters: this.percentile(radii, 0.9),
      maxRadiusMeters: radii[radii.length - 1],
    };
  }

  async pointDistance(pointAId: string, pointBId: string) {
    const rows = await this.prisma.point.findMany({
      where: { id: { in: [pointAId, pointBId] }, status: PointStatus.ACTIVE, deletedAt: null },
      select: { id: true, canonicalLatitude: true, canonicalLongitude: true },
    });
    const a = rows.find((x) => x.id === pointAId);
    const b = rows.find((x) => x.id === pointBId);
    if (!a?.canonicalLatitude || !a?.canonicalLongitude || !b?.canonicalLatitude || !b?.canonicalLongitude) return null;
    return this.distanceMeters(
      { latitude: Number(a.canonicalLatitude), longitude: Number(a.canonicalLongitude) },
      { latitude: Number(b.canonicalLatitude), longitude: Number(b.canonicalLongitude) },
    );
  }

  async technicianWorkProfile(technicianId: string, lookbackDays = 90) {
    const since = new Date(Date.now() - Math.max(1, lookbackDays) * 86_400_000);
    const visits = await this.prisma.maintenanceVisit.findMany({
      where: {
        technicianId,
        status: VisitStatus.VALID,
        suspiciousBatch: false,
        enteredLate: false,
        performedAt: { gte: since },
      },
      select: { pointId: true, latitude: true, longitude: true, accuracyMeters: true },
    });
    const usable = visits.filter((v) => v.latitude !== null && v.longitude !== null).map((v) => ({
      latitude: Number(v.latitude),
      longitude: Number(v.longitude),
    }));
    return {
      technicianId,
      lookbackDays,
      visitCount: visits.length,
      gpsSampleCount: usable.length,
      uniquePointCount: new Set(visits.map((v) => v.pointId)).size,
      ...this.summarize(usable),
    };
  }

  areAdjacent(a: GeoPoint, b: GeoPoint, maxMeters: number) {
    if (!Number.isFinite(maxMeters) || maxMeters <= 0) throw new Error('maxMeters must be positive');
    return this.distanceMeters(a, b) <= maxMeters;
  }

  private percentile(sorted: number[], p: number) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  }

  private rad(value: number) { return value * Math.PI / 180; }
}
