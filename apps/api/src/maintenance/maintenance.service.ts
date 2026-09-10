import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MaintenanceObligationStatus,
  MaintenanceType,
  PaperworkKind,
  PaperworkStatus,
  PointStatus,
  Prisma,
  UserRole,
  VisitStatus,
} from '@prisma/client';
import { AssignmentsService } from '../assignments/assignments.service';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpdatePaperworkDto } from './dto/bulk-update-paperwork.dto';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceAttemptDto } from './dto/maintenance-attempt.dto';
import { RevertMaintenanceDto } from './dto/revert-maintenance.dto';
import { UpdatePaperworkDto } from './dto/update-paperwork.dto';
import { GooglePlaceMatchService } from './google-place-match.service';
import { MaintenanceAnomalyService } from './maintenance-anomaly.service';
import { MaintenanceEngineService } from './maintenance-engine.service';
import { PointLocationLearningService } from './point-location-learning.service';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: MaintenanceEngineService,
    private readonly anomaly: MaintenanceAnomalyService,
    private readonly locationLearning: PointLocationLearningService,
    private readonly googlePlaces: GooglePlaceMatchService,
    private readonly assignments: AssignmentsService,
  ) {}

  due(asOf?: string) {
    return this.engine.due(asOf);
  }

  async technicianDashboard(technicianId: string, asOfInput?: string) {
    const technician = await this.requireTechnician(technicianId);
    const asOf = asOfInput ? new Date(asOfInput) : new Date();
    this.assertValidDate(asOf, 'asOf');
    const dayStart = this.dateOnly(asOf);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const due = await this.engine.due(this.dateKey(asOf));
    const assigned = due.items.filter((item) => item.technicianId === technicianId);

    const [todayCompleted, missingVisits] = await Promise.all([
      this.prisma.maintenanceVisit.count({
        where: {
          technicianId,
          status: VisitStatus.VALID,
          performedAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.maintenanceVisit.findMany({
        where: {
          technicianId,
          status: VisitStatus.VALID,
          OR: [
            { serviceSlipStatus: PaperworkStatus.MISSING },
            { confirmationStatus: PaperworkStatus.MISSING },
          ],
        },
        select: {
          id: true,
          performedAt: true,
          serviceSlipStatus: true,
          confirmationStatus: true,
          point: { select: { id: true, code: true, name: true } },
        },
        orderBy: { performedAt: 'asc' },
      }),
    ]);

    const paperwork = missingVisits.reduce(
      (acc, visit) => {
        const slipMissing = visit.serviceSlipStatus === PaperworkStatus.MISSING;
        const confirmationMissing = visit.confirmationStatus === PaperworkStatus.MISSING;
        if (slipMissing && confirmationMissing) acc.both += 1;
        else if (slipMissing) acc.serviceSlip += 1;
        else if (confirmationMissing) acc.confirmation += 1;
        return acc;
      },
      { serviceSlip: 0, confirmation: 0, both: 0 },
    );

    return {
      asOf: this.dateKey(asOf),
      technician,
      overdue: assigned.filter((item) => item.priority === 'OVERDUE').length,
      current: assigned.filter((item) => item.priority === 'CURRENT').length,
      missingPaperwork: missingVisits.length,
      paperwork,
      todayCompleted,
      due: assigned,
      missingItems: missingVisits,
    };
  }

  async technicianHistory(technicianId: string, dateInput?: string) {
    await this.requireTechnician(technicianId);
    const date = dateInput ? new Date(dateInput) : new Date();
    this.assertValidDate(date, 'date');
    const start = this.dateOnly(date);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const [visits, attempts] = await Promise.all([
      this.prisma.maintenanceVisit.findMany({
        where: {
          technicianId,
          status: VisitStatus.VALID,
          performedAt: { gte: start, lt: end },
        },
        select: {
          id: true,
          performedAt: true,
          enteredLate: true,
          serviceSlipStatus: true,
          confirmationStatus: true,
          point: { select: { id: true, code: true, name: true, maintenanceType: true } },
        },
        orderBy: { performedAt: 'asc' },
      }),
      this.prisma.maintenanceAttempt.findMany({
        where: {
          technicianId,
          attemptedAt: { gte: start, lt: end },
        },
        select: {
          id: true,
          attemptedAt: true,
          reason: true,
          note: true,
          point: { select: { id: true, code: true, name: true } },
        },
        orderBy: { attemptedAt: 'asc' },
      }),
    ]);

    const items = [
      ...visits.map((visit) => ({ type: 'MAINTENANCE' as const, at: visit.performedAt, ...visit })),
      ...attempts.map((attempt) => ({ type: 'ATTEMPT' as const, at: attempt.attemptedAt, ...attempt })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    return {
      date: this.dateKey(date),
      maintenanceCount: visits.length,
      attemptCount: attempts.length,
      totalOperations: items.length,
      items,
    };
  }

  async complete(dto: CompleteMaintenanceDto) {
    const existingByKey = await this.prisma.maintenanceVisit.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existingByKey) return existingByKey;

    const point = await this.prisma.point.findFirst({
      where: { id: dto.pointId, deletedAt: null },
      include: { region: true },
    });
    if (!point) throw new NotFoundException('Nokta bulunamadı');
    if (point.status !== PointStatus.ACTIVE) {
      throw new BadRequestException('Sadece AKTİF noktalarda bakım tamamlanabilir');
    }

    await this.requireTechnician(dto.technicianId);

    const now = new Date();
    const performedAt = dto.performedAt ? new Date(dto.performedAt) : now;
    const locationCapturedAt = new Date(dto.locationCapturedAt);
    const deviceRecordedAt = dto.deviceRecordedAt ? new Date(dto.deviceRecordedAt) : null;

    this.assertValidDate(performedAt, 'performedAt');
    this.assertValidDate(locationCapturedAt, 'locationCapturedAt');
    if (deviceRecordedAt) this.assertValidDate(deviceRecordedAt, 'deviceRecordedAt');
    if (performedAt.getTime() > now.getTime() + 5 * 60_000) {
      throw new BadRequestException('Bakım tarihi gelecekte olamaz');
    }

    const effectiveAssignment = await this.assignments.effectiveForPoint(point.id, performedAt);
    if (!effectiveAssignment.technicianId) {
      throw new BadRequestException('Bu nokta için atanmış aktif teknisyen bulunmuyor');
    }
    if (effectiveAssignment.technicianId !== dto.technicianId) {
      throw new ForbiddenException('Bu bakım tarihinde nokta başka bir teknisyene atanmış');
    }

    const enteredLate = this.dateKey(performedAt) < this.dateKey(now);
    if (enteredLate && !dto.lateEntryReason) {
      throw new BadRequestException('Geriye dönük bakım girişinde neden zorunludur');
    }

    await this.engine.ensureStandardObligations(performedAt);

    const openObligations =
      point.maintenanceType === MaintenanceType.STANDARD
        ? await this.prisma.maintenanceObligation.findMany({
            where: {
              pointId: point.id,
              status: MaintenanceObligationStatus.OPEN,
              dueStart: { lte: this.dateOnly(performedAt) },
            },
            orderBy: { dueStart: 'asc' },
          })
        : [];

    const obligation = openObligations.length ? openObligations[openObligations.length - 1] : null;
    if (point.maintenanceType === MaintenanceType.STANDARD && !obligation) {
      throw new BadRequestException('Bu tarih için açık Standard bakım yükümlülüğü bulunamadı');
    }

    const backlogToMiss = obligation
      ? openObligations.filter((item) => item.id !== obligation.id)
      : [];

    const lateEntryMinutes = enteredLate
      ? Math.max(1, Math.floor((now.getTime() - performedAt.getTime()) / 60_000))
      : null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.maintenanceVisit.create({
          data: {
            pointId: point.id,
            technicianId: dto.technicianId,
            obligationId: obligation?.id ?? null,
            performedAt,
            deviceRecordedAt,
            enteredLate,
            lateEntryMinutes,
            lateEntryReason: enteredLate ? dto.lateEntryReason ?? null : null,
            latitude: new Prisma.Decimal(dto.latitude),
            longitude: new Prisma.Decimal(dto.longitude),
            accuracyMeters:
              dto.accuracyMeters !== undefined ? new Prisma.Decimal(dto.accuracyMeters) : null,
            locationCapturedAt,
            locationLearningEligible: !enteredLate,
            suspiciousBatch: false,
            reviewRecommended: enteredLate,
            reviewReason: enteredLate ? 'GERİYE DÖNÜK GİRİŞ' : null,
            status: VisitStatus.VALID,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        if (backlogToMiss.length) {
          await tx.maintenanceObligation.updateMany({
            where: { id: { in: backlogToMiss.map((item) => item.id) }, status: MaintenanceObligationStatus.OPEN },
            data: {
              status: MaintenanceObligationStatus.MISSED,
              resolvedAt: performedAt,
              resolvedByVisitId: created.id,
              completedAt: null,
            },
          });
        }

        if (obligation) {
          await tx.maintenanceObligation.update({
            where: { id: obligation.id },
            data: {
              status: MaintenanceObligationStatus.COMPLETED,
              completedAt: performedAt,
              resolvedAt: performedAt,
              resolvedByVisitId: created.id,
            },
          });
        }

        return { visit: created, missedPeriods: backlogToMiss.length };
      });

      await this.runPostProcessing(dto.technicianId, point.id);

      const visit =
        (await this.prisma.maintenanceVisit.findUnique({ where: { id: result.visit.id } })) ?? result.visit;
      return { ...visit, resolvedBacklogPeriods: result.missedPeriods };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu bakım kaydı zaten işlendi');
      }
      throw error;
    }
  }

  async revert(dto: RevertMaintenanceDto) {
    const [visit, actor] = await Promise.all([
      this.prisma.maintenanceVisit.findUnique({ where: { id: dto.visitId } }),
      this.prisma.user.findFirst({ where: { id: dto.userId, active: true } }),
    ]);
    if (!visit) throw new NotFoundException('Bakım kaydı bulunamadı');
    if (!actor) throw new NotFoundException('Kullanıcı bulunamadı veya pasif');
    if (visit.status === VisitStatus.REVERSED) return visit;

    if (actor.role !== UserRole.ADMIN && visit.technicianId !== actor.id) {
      throw new ForbiddenException('Teknisyen yalnızca kendi bakım kaydını geri alabilir');
    }

    return this.prisma.$transaction(async (tx) => {
      const reverted = await tx.maintenanceVisit.update({
        where: { id: visit.id },
        data: {
          status: VisitStatus.REVERSED,
          reversedAt: new Date(),
          reversedByUserId: actor.id,
          reviewRecommended: true,
          reviewReason: `GERİ ALINDI: ${dto.reason}`,
          locationLearningEligible: false,
        },
      });

      await tx.maintenanceObligation.updateMany({
        where: { resolvedByVisitId: visit.id },
        data: {
          status: MaintenanceObligationStatus.OPEN,
          completedAt: null,
          resolvedAt: null,
          resolvedByVisitId: null,
        },
      });

      return reverted;
    });
  }

  async recordAttempt(dto: MaintenanceAttemptDto) {
    const existing = await this.prisma.maintenanceAttempt.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;

    const [point] = await Promise.all([
      this.prisma.point.findFirst({ where: { id: dto.pointId, deletedAt: null } }),
      this.requireTechnician(dto.technicianId),
    ]);
    if (!point) throw new NotFoundException('Nokta bulunamadı');
    if (point.status !== PointStatus.ACTIVE) {
      throw new BadRequestException('Pasif veya iptal noktada bakım denemesi kaydedilemez');
    }

    const effectiveAssignment = await this.assignments.effectiveForPoint(point.id, new Date());
    if (!effectiveAssignment.technicianId) {
      throw new BadRequestException('Bu nokta için atanmış aktif teknisyen bulunmuyor');
    }
    if (effectiveAssignment.technicianId !== dto.technicianId) {
      throw new ForbiddenException('Bu nokta başka bir teknisyene atanmış');
    }

    const locationCapturedAt = new Date(dto.locationCapturedAt);
    this.assertValidDate(locationCapturedAt, 'locationCapturedAt');

    try {
      return await this.prisma.maintenanceAttempt.create({
        data: {
          pointId: dto.pointId,
          technicianId: dto.technicianId,
          reason: dto.reason,
          note: dto.note ?? null,
          latitude: new Prisma.Decimal(dto.latitude),
          longitude: new Prisma.Decimal(dto.longitude),
          accuracyMeters:
            dto.accuracyMeters !== undefined ? new Prisma.Decimal(dto.accuracyMeters) : null,
          locationCapturedAt,
          idempotencyKey: dto.idempotencyKey,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu bakım denemesi zaten işlendi');
      }
      throw error;
    }
  }

  async updatePaperwork(dto: UpdatePaperworkDto) {
    const [visit, admin] = await Promise.all([
      this.prisma.maintenanceVisit.findUnique({ where: { id: dto.visitId } }),
      this.prisma.user.findFirst({ where: { id: dto.adminUserId, active: true } }),
    ]);
    if (!visit) throw new NotFoundException('Bakım kaydı bulunamadı');
    if (!admin || admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Servis fişi ve teyit durumunu yalnızca admin değiştirebilir');
    }
    if (visit.status !== VisitStatus.VALID) {
      throw new BadRequestException('Geri alınmış bakımın evrak durumu değiştirilemez');
    }

    const previousStatus =
      dto.kind === PaperworkKind.SERVICE_SLIP ? visit.serviceSlipStatus : visit.confirmationStatus;
    if (previousStatus === dto.status) return visit;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceVisit.update({
        where: { id: visit.id },
        data:
          dto.kind === PaperworkKind.SERVICE_SLIP
            ? { serviceSlipStatus: dto.status }
            : { confirmationStatus: dto.status },
      });

      await tx.paperworkStatusHistory.create({
        data: {
          visitId: visit.id,
          kind: dto.kind,
          previousStatus,
          newStatus: dto.status,
          changedById: admin.id,
          note: dto.note ?? null,
        },
      });

      return updated;
    });
  }

  async bulkUpdatePaperwork(dto: BulkUpdatePaperworkDto) {
    const results = [];
    for (const item of dto.items) results.push(await this.updatePaperwork(item));
    return { updated: results.length, items: results };
  }

  async paperworkHistory(visitId: string) {
    const visit = await this.prisma.maintenanceVisit.findUnique({
      where: { id: visitId },
      select: {
        id: true,
        status: true,
        serviceSlipStatus: true,
        confirmationStatus: true,
        point: { select: { id: true, code: true, name: true } },
      },
    });
    if (!visit) throw new NotFoundException('Bakım kaydı bulunamadı');

    const history = await this.prisma.paperworkStatusHistory.findMany({
      where: { visitId },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { changedAt: 'asc' },
    });
    return { visit, history };
  }

  private async runPostProcessing(technicianId: string, pointId: string) {
    try {
      await this.anomaly.scanTechnician(technicianId, 24);
      await this.locationLearning.refreshPoint(pointId);
      await this.googlePlaces.matchPoint(pointId);
    } catch (error) {
      this.logger.warn(
        `Maintenance post-processing failed for point ${pointId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async requireTechnician(technicianId: string) {
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, active: true, role: UserRole.TECHNICIAN },
      select: { id: true, name: true },
    });
    if (!technician) throw new NotFoundException('Teknisyen bulunamadı veya pasif');
    return technician;
  }

  private assertValidDate(value: Date, field: string) {
    if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} geçersiz`);
  }

  private dateOnly(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private dateKey(date: Date) {
    return this.dateOnly(date).toISOString().slice(0, 10);
  }
}
