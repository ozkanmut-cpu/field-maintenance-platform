import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ReviewDecision, UserRole, VisitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResolveReviewDto } from './dto/resolve-review.dto';

type VisitSample = {
  id: string;
  pointId: string;
  technicianId: string;
  recordedAtServer: Date;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  enteredLate: boolean;
  status: VisitStatus;
};

@Injectable()
export class MaintenanceAnomalyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async scanTechnician(technicianId: string, lookbackHours = 24) {
    const now = new Date();
    const since = new Date(now.getTime() - Math.max(1, lookbackHours) * 60 * 60_000);

    const visits = await this.prisma.maintenanceVisit.findMany({
      where: {
        technicianId,
        status: VisitStatus.VALID,
        recordedAtServer: { gte: since },
      },
      orderBy: { recordedAtServer: 'asc' },
      select: {
        id: true,
        pointId: true,
        technicianId: true,
        recordedAtServer: true,
        latitude: true,
        longitude: true,
        enteredLate: true,
        status: true,
      },
    });

    const flagged = new Map<string, string[]>();
    const windowMinutes = this.numberConfig('ANTI_BATCH_WINDOW_MINUTES', 12);
    const stationaryMeters = this.numberConfig('ANTI_BATCH_STATIONARY_METERS', 150);
    const maxSpeedKmh = this.numberConfig('ANTI_BATCH_MAX_SPEED_KMH', 160);

    for (let index = 1; index < visits.length; index += 1) {
      const previous = visits[index - 1];
      const current = visits[index];
      if (previous.pointId === current.pointId) continue;

      const elapsedMinutes =
        (current.recordedAtServer.getTime() - previous.recordedAtServer.getTime()) / 60_000;
      if (elapsedMinutes < 0) continue;

      const distanceMeters = this.distanceMeters(previous, current);
      const reasons: string[] = [];

      if (elapsedMinutes <= windowMinutes && distanceMeters <= stationaryMeters) {
        reasons.push(
          `FARKLI NOKTALAR ARDIŞIK GİRİLDİ: ${elapsedMinutes.toFixed(1)} dk / ${Math.round(distanceMeters)} m`,
        );
      }

      if (elapsedMinutes > 0) {
        const speedKmh = (distanceMeters / 1000) / (elapsedMinutes / 60);
        if (elapsedMinutes <= windowMinutes && speedKmh > maxSpeedKmh) {
          reasons.push(
            `SEYAHAT SÜRESİ UYUMSUZ: ${Math.round(distanceMeters)} m / ${elapsedMinutes.toFixed(1)} dk (${Math.round(speedKmh)} km/s)`,
          );
        }
      }

      if (reasons.length === 0) continue;
      for (const visit of [previous, current]) {
        const list = flagged.get(visit.id) ?? [];
        list.push(...reasons);
        flagged.set(visit.id, [...new Set(list)]);
      }
    }

    let appliedFlags = 0;
    for (const [visitId, reasons] of flagged.entries()) {
      const visit = visits.find((item) => item.id === visitId);
      if (!visit) continue;

      const latestResolution = await this.prisma.maintenanceReviewResolution.findFirst({
        where: { visitId },
        orderBy: { resolvedAt: 'desc' },
        select: { decision: true },
      });

      if (
        latestResolution &&
        latestResolution.decision !== ReviewDecision.NEEDS_FOLLOWUP
      ) {
        continue;
      }

      await this.prisma.maintenanceVisit.update({
        where: { id: visitId },
        data: {
          suspiciousBatch: true,
          reviewRecommended: true,
          reviewReason: reasons.join(' | '),
          locationLearningEligible: false,
        },
      });
      appliedFlags += 1;
    }

    return {
      technicianId,
      scannedFrom: since,
      scannedTo: now,
      scannedVisits: visits.length,
      flaggedVisits: appliedFlags,
      thresholds: { windowMinutes, stationaryMeters, maxSpeedKmh },
    };
  }

  async reviewQueue(limit = 100) {
    return this.prisma.maintenanceVisit.findMany({
      where: {
        status: VisitStatus.VALID,
        reviewRecommended: true,
      },
      select: {
        id: true,
        performedAt: true,
        recordedAtServer: true,
        enteredLate: true,
        suspiciousBatch: true,
        reviewReason: true,
        locationLearningEligible: true,
        latitude: true,
        longitude: true,
        accuracyMeters: true,
        technician: { select: { id: true, name: true } },
        point: { select: { id: true, code: true, name: true, regionId: true } },
      },
      orderBy: { recordedAtServer: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async resolveReview(dto: ResolveReviewDto) {
    const [visit, admin] = await Promise.all([
      this.prisma.maintenanceVisit.findUnique({ where: { id: dto.visitId } }),
      this.prisma.user.findFirst({ where: { id: dto.adminUserId, active: true } }),
    ]);

    if (!visit) throw new NotFoundException('Bakım kaydı bulunamadı');
    if (!admin || admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Kontrol kararını yalnızca admin verebilir');
    }

    const keepOpen = dto.decision === ReviewDecision.NEEDS_FOLLOWUP;
    const clearAnomaly = dto.decision === ReviewDecision.NO_ISSUE;
    const locationEligible =
      clearAnomaly && visit.status === VisitStatus.VALID && !visit.enteredLate;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceVisit.update({
        where: { id: visit.id },
        data: {
          reviewRecommended: keepOpen,
          suspiciousBatch: clearAnomaly ? false : visit.suspiciousBatch,
          locationLearningEligible:
            dto.decision === ReviewDecision.KEEP_LOCATION_EXCLUDED
              ? false
              : keepOpen
                ? visit.locationLearningEligible
                : locationEligible,
        },
      });

      const resolution = await tx.maintenanceReviewResolution.create({
        data: {
          visitId: visit.id,
          decision: dto.decision,
          previousReason: visit.reviewReason,
          resolvedById: admin.id,
          note: dto.note?.trim() || null,
        },
      });

      return { visit: updated, resolution, queueClosed: !keepOpen };
    });
  }

  async reviewHistory(visitId: string) {
    const visit = await this.prisma.maintenanceVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        reviewRecommended: true,
        reviewReason: true,
        suspiciousBatch: true,
        locationLearningEligible: true,
        status: true,
        point: { select: { id: true, code: true, name: true } },
        technician: { select: { id: true, name: true } },
      },
    });
    if (!visit) throw new NotFoundException('Bakım kaydı bulunamadı');

    const history = await this.prisma.maintenanceReviewResolution.findMany({
      where: { visitId },
      include: { resolvedBy: { select: { id: true, name: true } } },
      orderBy: { resolvedAt: 'asc' },
    });

    return { visit, history };
  }

  private numberConfig(name: string, fallback: number) {
    const raw = this.config.get<string>(name);
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private distanceMeters(a: VisitSample, b: VisitSample) {
    const lat1 = Number(a.latitude) * (Math.PI / 180);
    const lat2 = Number(b.latitude) * (Math.PI / 180);
    const deltaLat = lat2 - lat1;
    const deltaLon = (Number(b.longitude) - Number(a.longitude)) * (Math.PI / 180);
    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
}
