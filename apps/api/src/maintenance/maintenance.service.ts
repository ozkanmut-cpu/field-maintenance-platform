import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttemptReviewStatus,
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
import { businessDateKey, businessDayRange, dateOnlyForBusinessDate } from '../common/business-time';
import { nextSmartcleanDueDate } from '../common/smartclean-schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpdatePaperworkDto } from './dto/bulk-update-paperwork.dto';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceAttemptDto } from './dto/maintenance-attempt.dto';
import { RevertMaintenanceDto } from './dto/revert-maintenance.dto';
import { AttemptAdminDecision, ReviewAttemptDto } from './dto/review-attempt.dto';
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
    private readonly config: ConfigService,
    private readonly engine: MaintenanceEngineService,
    private readonly anomaly: MaintenanceAnomalyService,
    private readonly locationLearning: PointLocationLearningService,
    private readonly googlePlaces: GooglePlaceMatchService,
    private readonly assignments: AssignmentsService,
  ) {}

  due(asOf?: string) {
    return this.engine.due(asOf);
  }

  async helpTargets(helperId: string) {
    await this.requireTechnician(helperId);
    const permissions = await this.prisma.technicianHelpPermission.findMany({
      where: { helperId, target: { active: true, role: UserRole.TECHNICIAN } },
      include: { target: { select: { id: true, name: true, username: true } } },
      orderBy: { target: { name: 'asc' } },
    });
    return permissions.map((item) => item.target);
  }

  async assertCanHelp(helperId: string, targetId: string) {
    if (helperId === targetId) return;
    const permission = await this.prisma.technicianHelpPermission.findUnique({
      where: { helperId_targetId: { helperId, targetId } },
      include: { target: { select: { active: true, role: true } } },
    });
    if (!permission || !permission.target.active || permission.target.role !== UserRole.TECHNICIAN) {
      throw new ForbiddenException('Bu teknisyenin görevlerine yardım yetkin yok');
    }
  }

  async technicianDashboard(technicianId: string, asOfInput?: string, requesterId?: string) {
    if (requesterId && requesterId !== technicianId) await this.assertCanHelp(requesterId, technicianId);
    const technician = await this.requireTechnician(technicianId);
    const asOf = asOfInput ? new Date(asOfInput) : new Date();
    this.assertValidDate(asOf, 'asOf');
    const { start: dayStart, end: dayEnd } = businessDayRange(asOf);

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
    const { start, end } = businessDayRange(date);

    const [visits, attempts, nonMaintenanceVisits, prospectVisits] = await Promise.all([
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
          assistedForTechnicianId: true,
          assistedForTechnician: { select: { id: true, name: true, username: true } },
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
      this.prisma.nonMaintenanceVisit.findMany({
        where: { technicianId, visitedAt: { gte: start, lt: end } },
        select: {
          id: true,
          visitedAt: true,
          purpose: true,
          note: true,
          point: { select: { id: true, code: true, name: true } },
        },
        orderBy: { visitedAt: 'asc' },
      }),
      this.prisma.prospectVisit.findMany({
        where: { technicianId, visitedAt: { gte: start, lt: end } },
        select: {
          id: true,
          visitedAt: true,
          purpose: true,
          note: true,
          prospect: { select: { id: true, name: true, sapNo: true, status: true, convertedPointId: true } },
        },
        orderBy: { visitedAt: 'asc' },
      }),
    ]);

    const items = [
      ...visits.map((visit) => ({ type: 'MAINTENANCE' as const, at: visit.performedAt, ...visit })),
      ...attempts.map((attempt) => ({ type: 'ATTEMPT' as const, at: attempt.attemptedAt, ...attempt })),
      ...nonMaintenanceVisits.map((visit) => ({
        type: 'NON_MAINTENANCE_VISIT' as const,
        at: visit.visitedAt,
        ...visit,
      })),
      ...prospectVisits.map((visit) => ({ type: 'PROSPECT_VISIT' as const, at: visit.visitedAt, ...visit })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    return {
      date: this.dateKey(date),
      maintenanceCount: visits.length,
      attemptCount: attempts.length,
      nonMaintenanceVisitCount: nonMaintenanceVisits.length,
      prospectVisitCount: prospectVisits.length,
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
      if (!dto.assistedForTechnicianId || dto.assistedForTechnicianId !== effectiveAssignment.technicianId) {
        throw new ForbiddenException('Bu bakım tarihinde nokta başka bir teknisyene atanmış');
      }
      await this.assertCanHelp(dto.technicianId, dto.assistedForTechnicianId);
    } else if (dto.assistedForTechnicianId && dto.assistedForTechnicianId !== dto.technicianId) {
      throw new BadRequestException('Yardım hedefi bu noktanın atanmış teknisyeni değil');
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

    if (dto.equipmentConfirmed !== true) throw new BadRequestException('Nokta ekipman bilgisi doğrulanmalıdır');
    const equipment = {
      coolerCount: dto.coolerCount ?? point.coolerCount,
      towerCount: dto.towerCount ?? point.towerCount,
      tapCount: dto.tapCount ?? point.tapCount,
      smarttapCount: dto.smarttapCount ?? point.smarttapCount,
    };
    if (Object.values(equipment).some((value) => value === null || value === undefined || !Number.isInteger(value) || value < 0)) {
      throw new BadRequestException('Soğutucu, kule, musluk ve SmartTap adetlerinin tamamı girilmelidir');
    }
    const equipmentChanged = point.coolerCount !== equipment.coolerCount || point.towerCount !== equipment.towerCount || point.tapCount !== equipment.tapCount || point.smarttapCount !== equipment.smarttapCount;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.maintenanceVisit.create({
          data: {
            pointId: point.id,
            technicianId: dto.technicianId,
            assistedForTechnicianId: dto.assistedForTechnicianId ?? null,
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
            coolerCount: equipment.coolerCount!,
            towerCount: equipment.towerCount!,
            tapCount: equipment.tapCount!,
            smarttapCount: equipment.smarttapCount!,
            equipmentConfirmed: true,
            status: VisitStatus.VALID,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        await tx.point.update({
          where: { id: point.id },
          data: { ...equipment, equipmentVerifiedAt: performedAt, equipmentVerifiedById: dto.technicianId },
        });
        if (equipmentChanged) {
          await tx.adminAuditLog.create({
            data: {
              actorId: dto.technicianId, entityType: 'POINT_EQUIPMENT', entityId: point.id, action: 'MAINTENANCE_VERIFIED_CHANGED',
              oldValue: { coolerCount: point.coolerCount, towerCount: point.towerCount, tapCount: point.tapCount, smarttapCount: point.smarttapCount },
              newValue: equipment, note: 'Bakım sırasında ekipman bilgisi doğrulandı ve güncellendi',
            },
          });
        }

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
      if (!dto.assistedForTechnicianId || dto.assistedForTechnicianId !== effectiveAssignment.technicianId) {
        throw new ForbiddenException('Bu nokta başka bir teknisyene atanmış');
      }
      await this.assertCanHelp(dto.technicianId, dto.assistedForTechnicianId);
    } else if (dto.assistedForTechnicianId && dto.assistedForTechnicianId !== dto.technicianId) {
      throw new BadRequestException('Yardım hedefi bu noktanın atanmış teknisyeni değil');
    }

    const locationCapturedAt = new Date(dto.locationCapturedAt);
    this.assertValidDate(locationCapturedAt, 'locationCapturedAt');

    try {
      return await this.prisma.maintenanceAttempt.create({
        data: {
          pointId: dto.pointId,
          technicianId: dto.technicianId,
          assistedForTechnicianId: dto.assistedForTechnicianId ?? null,
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

  async attemptReviewQueue() {
    const items = await this.prisma.maintenanceAttempt.findMany({
      where: { reviewStatus: AttemptReviewStatus.PENDING },
      select: {
        id: true, reason: true, note: true, attemptedAt: true,
        latitude: true, longitude: true, accuracyMeters: true,
        point: { select: { id: true, code: true, name: true, maintenanceType: true, region: { select: { name: true } } } },
        technician: { select: { id: true, name: true, username: true } },
        assistedForTechnician: { select: { id: true, name: true, username: true } },
      },
      orderBy: { attemptedAt: 'asc' },
    });
    return { count: items.length, items };
  }

  async attemptReviewHistory(limit = 100) {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 500) : 100;
    const items = await this.prisma.maintenanceAttempt.findMany({
      where: { reviewStatus: { in: [AttemptReviewStatus.APPROVED, AttemptReviewStatus.REJECTED] } },
      select: {
        id: true, reason: true, note: true, attemptedAt: true, reviewStatus: true, reviewedAt: true, reviewNote: true, closedDueDate: true,
        point: { select: { id: true, code: true, name: true, maintenanceType: true, region: { select: { name: true } } } },
        technician: { select: { id: true, name: true, username: true } },
        assistedForTechnician: { select: { id: true, name: true, username: true } },
        reviewedBy: { select: { id: true, name: true, username: true } },
      },
      orderBy: { reviewedAt: 'desc' },
      take: safeLimit,
    });
    return { count: items.length, items };
  }

  async reviewAttempt(adminUserId: string, dto: ReviewAttemptDto) {
    const [admin, attempt] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: adminUserId, active: true, role: UserRole.ADMIN }, select: { id: true, name: true } }),
      this.prisma.maintenanceAttempt.findUnique({
        where: { id: dto.attemptId },
        include: {
          point: {
            include: { visits: { where: { status: VisitStatus.VALID }, orderBy: { performedAt: 'desc' }, take: 1 } },
          },
        },
      }),
    ]);
    if (!admin) throw new ForbiddenException('Bu işlemi yalnızca admin yapabilir');
    if (!attempt) throw new NotFoundException('Yapılamadı kaydı bulunamadı');
    if (attempt.reviewStatus !== AttemptReviewStatus.PENDING) {
      throw new BadRequestException('Bu kayıt daha önce incelenmiş');
    }

    if (dto.decision === AttemptAdminDecision.REJECTED) {
      const updated = await this.prisma.maintenanceAttempt.update({
        where: { id: attempt.id },
        data: { reviewStatus: AttemptReviewStatus.REJECTED, reviewedAt: new Date(), reviewedById: admin.id, reviewNote: dto.note?.trim() || null },
      });
      await this.prisma.adminAuditLog.create({ data: { entityType: 'MAINTENANCE_ATTEMPT', entityId: attempt.id, action: 'REJECTED', actorId: admin.id, note: dto.note?.trim() || null } });
      return { closed: false, attempt: updated };
    }

    let closedDueDate: Date | null = null;
    return this.prisma.$transaction(async (tx) => {
      let closedObligations = 0;
      if (attempt.point.maintenanceType === MaintenanceType.STANDARD) {
        const dueDate = this.dateOnly(attempt.attemptedAt);
        const open = await tx.maintenanceObligation.findMany({ where: { pointId: attempt.pointId, status: MaintenanceObligationStatus.OPEN, dueStart: { lte: dueDate } }, select: { id: true, dueStart: true } });
        if (open.length) {
          closedDueDate = open.reduce((latest, item) => item.dueStart > latest ? item.dueStart : latest, open[0].dueStart);
          const result = await tx.maintenanceObligation.updateMany({
            where: { id: { in: open.map((item) => item.id) }, status: MaintenanceObligationStatus.OPEN },
            data: { status: MaintenanceObligationStatus.MISSED, resolvedAt: attempt.attemptedAt, resolvedByAttemptId: attempt.id, completedAt: null },
          });
          closedObligations = result.count;
        }
      } else {
        const base = attempt.point.visits[0]?.performedAt ?? attempt.point.smartcleanReferenceAt;
        if (base && [1, 2].includes(attempt.point.maintenanceWeek ?? 0)) {
          const attemptedDate = this.dateOnly(attempt.attemptedAt);
          let due = nextSmartcleanDueDate(this.dateOnly(base), attempt.point.maintenanceWeek!, this.week1Anchor());
          while (due <= attemptedDate) { closedDueDate = due; due = this.addDays(due, 14); }
        }
      }

      const updated = await tx.maintenanceAttempt.update({
        where: { id: attempt.id },
        data: { reviewStatus: AttemptReviewStatus.APPROVED, reviewedAt: new Date(), reviewedById: admin.id, reviewNote: dto.note?.trim() || null, closedDueDate },
      });
      await tx.adminAuditLog.create({
        data: { entityType: 'MAINTENANCE_ATTEMPT', entityId: attempt.id, action: 'APPROVED_TASK_CLOSED', actorId: admin.id, newValue: { pointId: attempt.pointId, closedObligations, closedDueDate: closedDueDate?.toISOString() ?? null }, note: dto.note?.trim() || null },
      });
      return { closed: true, closedObligations, closedDueDate, attempt: updated };
    });
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

  private week1Anchor() {
    const value = this.config.get<string>('STANDARD_WEEK1_ANCHOR');
    if (!value) throw new Error('STANDARD_WEEK1_ANCHOR is required');
    return this.dateOnly(new Date(value));
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + days); return copy;
  }

  private dateOnly(date: Date) {
    return dateOnlyForBusinessDate(date);
  }

  private dateKey(date: Date) {
    return businessDateKey(date);
  }
}
