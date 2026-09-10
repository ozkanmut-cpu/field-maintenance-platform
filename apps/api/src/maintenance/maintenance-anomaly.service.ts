import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, VisitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

    for (const [visitId, reasons] of flagged.entries()) {
      const visit = visits.find((item) => item.id === visitId);
      if (!visit) continue;

      await this.prisma.maintenanceVisit.update({
        where: { id: visitId },
        data: {
          suspiciousBatch: true,
          reviewRecommended: true,
          reviewReason: reasons.join(' | '),
          // Geriye dönük giriş zaten uygun değildir; şüpheli ardışık giriş de
          // hiçbir koşulda nokta konumu öğrenme kanıtı olamaz.
          locationLearningEligible: false,
        },
      });
    }

    return {
      technicianId,
      scannedFrom: since,
      scannedTo: now,
      scannedVisits: visits.length,
      flaggedVisits: flagged.size,
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
