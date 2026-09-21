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
  ConfirmationApprovalSource,
  MaintenanceObligationStatus,
  MaintenanceType,
  PaperworkKind,
  PaperworkStatus,
  PointStatus,
  Prisma,
  UserRole,
  VisitStatus,
  LocationSource,
} from '@prisma/client';
import { AssignmentsService } from '../assignments/assignments.service';
import { businessDateKey, businessDayRange, dateOnlyForBusinessDate } from '../common/business-time';
import { nextSmartcleanDueDate } from '../common/smartclean-schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpdatePaperworkDto } from './dto/bulk-update-paperwork.dto';
import { CompleteServiceSlipReviewDto } from './dto/complete-service-slip-review.dto';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceAttemptDto } from './dto/maintenance-attempt.dto';
import { RevertMaintenanceDto } from './dto/revert-maintenance.dto';
import { AttemptAdminDecision, ReviewAttemptDto } from './dto/review-attempt.dto';
import { UpdatePaperworkDto } from './dto/update-paperwork.dto';
import { GooglePlaceMatchService } from './google-place-match.service';
import { MaintenanceAnomalyService } from './maintenance-anomaly.service';
import { MaintenanceEngineService } from './maintenance-engine.service';
import { PointLocationLearningService } from './point-location-learning.service';
import { ApproveVisitLocationDto } from './dto/approve-visit-location.dto';
import { evaluateMaintenanceLocation } from './maintenance-location-policy';
import { evaluateMaintenanceDate } from './maintenance-date-policy';

type ManualPaperworkEvent = {
  kind: PaperworkKind;
  newStatus: PaperworkStatus;
  changedAt: Date;
  [key: string]: unknown;
};
type SapReconciliationEvent = {
  id: string;
  importRunId: string;
  previousStatus: PaperworkStatus;
  nextStatus: PaperworkStatus;
  approvalSource: ConfirmationApprovalSource | null;
  createdAt: Date;
};

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
            { serviceSlipStatus: PaperworkStatus.PENDING_REVIEW },
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
        const slipReviewPending = visit.serviceSlipStatus === PaperworkStatus.PENDING_REVIEW;
        const confirmationMissing = visit.confirmationStatus === PaperworkStatus.MISSING;
        if (slipMissing) acc.serviceSlip += 1;
        if (slipReviewPending) acc.serviceSlipReviewPending += 1;
        if (confirmationMissing) acc.confirmation += 1;
        if (slipMissing && confirmationMissing) acc.both += 1;
        return acc;
      },
      { serviceSlip: 0, serviceSlipReviewPending: 0, confirmation: 0, both: 0 },
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

  async technicianHistory(technicianId: string, dateInput?: string, now = new Date()) {
    await this.requireTechnician(technicianId);
    const date = dateInput ? new Date(dateInput) : now;
    this.assertValidDate(date, 'date');
    const { start, end } = businessDayRange(date);
    const historyRange = dateInput
      ? { start, end }
      : {
          start: businessDayRange(new Date(`${this.previousBusinessDateKey(businessDateKey(now))}T12:00:00.000Z`)).start,
          end,
        };

    const [visits, attempts, nonMaintenanceVisits, prospectVisits] = await Promise.all([
      this.prisma.maintenanceVisit.findMany({
        where: {
          technicianId,
          status: VisitStatus.VALID,
          recordedAtServer: { gte: historyRange.start, lt: historyRange.end },
        },
        select: {
          id: true,
          performedAt: true,
          recordedAtServer: true,
          enteredLate: true,
          assistedForTechnicianId: true,
          assistedForTechnician: { select: { id: true, name: true, username: true } },
          serviceSlipStatus: true,
          confirmationStatus: true,
          totalCoolerCount: true,
          maintainedCoolerCount: true,
          missingMaintenanceCount: true,
          missingMaintenanceExplanation: true,
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
      ...visits.map((visit) => ({
        type: 'MAINTENANCE' as const,
        at: visit.performedAt,
        revertEligible: this.isWithinRevertWindow(visit.recordedAtServer, now),
        ...visit,
        maintenanceSummary:
          visit.totalCoolerCount != null && visit.maintainedCoolerCount != null
            ? `${visit.maintainedCoolerCount}/${visit.totalCoolerCount} soğutucu bakım${visit.missingMaintenanceCount ? ` · ${visit.missingMaintenanceCount} eksik` : ''}`
            : null,
      })),
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

  async complete(dto: CompleteMaintenanceDto, now = new Date()) {
    const existingByKey = await this.prisma.maintenanceVisit.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existingByKey) return { ...existingByKey, pastDated: existingByKey.enteredLate };

    const point = await this.prisma.point.findFirst({
      where: { id: dto.pointId, deletedAt: null },
      include: { region: true },
    });
    if (!point) throw new NotFoundException('Nokta bulunamadı');
    if (point.status !== PointStatus.ACTIVE) {
      throw new BadRequestException('Sadece AKTİF noktalarda bakım tamamlanabilir');
    }

    await this.requireTechnician(dto.technicianId);

    const performedAt = dto.performedAt ? new Date(dto.performedAt) : now;
    const locationCapturedAt = dto.locationCapturedAt ? new Date(dto.locationCapturedAt) : null;
    const deviceRecordedAt = dto.deviceRecordedAt ? new Date(dto.deviceRecordedAt) : null;

    this.assertValidDate(performedAt, 'performedAt');
    if (locationCapturedAt) this.assertValidDate(locationCapturedAt, 'locationCapturedAt');
    if (deviceRecordedAt) this.assertValidDate(deviceRecordedAt, 'deviceRecordedAt');
    const dateDecision = evaluateMaintenanceDate(performedAt, now);
    if (!dateDecision.allowed) throw new BadRequestException(dateDecision.reason);

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

    const enteredLate = dateDecision.enteredLate;
    if (enteredLate && !dto.lateEntryReason?.trim()) {
      throw new BadRequestException('Geriye dönük bakım girişinde neden zorunludur');
    }
    if (dateDecision.locationRequired && (dto.latitude === undefined || dto.longitude === undefined || !locationCapturedAt)) {
      throw new BadRequestException('Bugünün bakımında konum bilgisi zorunludur');
    }
    if (!dateDecision.locationRequired && (dto.latitude !== undefined || dto.longitude !== undefined || dto.accuracyMeters !== undefined || locationCapturedAt)) {
      throw new BadRequestException('Geriye dönük bakımda konum bilgisi kaydedilemez');
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
    const submittedEquipment = {
      coolerCount: dto.coolerCount ?? point.coolerCount,
      towerCount: dto.towerCount ?? point.towerCount,
      tapCount: dto.tapCount ?? point.tapCount,
      smarttapCount: dto.smarttapCount ?? point.smarttapCount,
    };
    if (Object.values(submittedEquipment).some((value) => value === null || value === undefined || !Number.isInteger(value) || value < 0)) {
      throw new BadRequestException('Soğutucu, kule, musluk ve SmartTap adetlerinin tamamı girilmelidir');
    }
    // A known point count is the operational total for this visit. Only an unconfigured point
    // may bootstrap that total from the submitted equipment confirmation.
    const totalCoolerCount = point.coolerCount ?? submittedEquipment.coolerCount!;
    const correctionNeeded = (point.coolerCount != null && point.coolerCount !== submittedEquipment.coolerCount)
      || (point.towerCount != null && point.towerCount !== submittedEquipment.towerCount)
      || (point.tapCount != null && point.tapCount !== submittedEquipment.tapCount)
      || (point.smarttapCount != null && point.smarttapCount !== submittedEquipment.smarttapCount);
    if (correctionNeeded && dto.equipmentCorrectionRequested !== true) {
      throw new BadRequestException('Ekipman sayısı değişikliğini ayrıca onayla');
    }
    const equipment = {
      coolerCount: point.coolerCount == null || dto.equipmentCorrectionRequested === true
        ? submittedEquipment.coolerCount
        : point.coolerCount,
      towerCount: point.towerCount == null || dto.equipmentCorrectionRequested === true
        ? submittedEquipment.towerCount
        : point.towerCount,
      tapCount: point.tapCount == null || dto.equipmentCorrectionRequested === true
        ? submittedEquipment.tapCount
        : point.tapCount,
      smarttapCount: point.smarttapCount == null || dto.equipmentCorrectionRequested === true
        ? submittedEquipment.smarttapCount
        : point.smarttapCount,
    };
    const maintainedCoolerCount = dto.maintainedCoolerCount ?? totalCoolerCount;
    if (!Number.isInteger(maintainedCoolerCount) || maintainedCoolerCount < 0) {
      throw new BadRequestException('Bakımı yapılan soğutucu adedi 0 veya daha büyük tam sayı olmalıdır');
    }
    if (maintainedCoolerCount > totalCoolerCount) {
      throw new BadRequestException('Bakımı yapılan soğutucu adedi toplam soğutucu adedinden büyük olamaz');
    }
    const missingMaintenanceCount = totalCoolerCount - maintainedCoolerCount;
    const missingMaintenanceExplanation = missingMaintenanceCount > 0
      ? dto.missingMaintenanceExplanation?.trim() || null
      : null;
    const equipmentChanged = point.coolerCount !== equipment.coolerCount || point.towerCount !== equipment.towerCount || point.tapCount !== equipment.tapCount || point.smarttapCount !== equipment.smarttapCount;
    const locationPresenceConfirmed = dateDecision.locationRequired ? dto.locationPresenceConfirmed ?? true : false;
    const locationDecision = dateDecision.locationRequired
      ? evaluateMaintenanceLocation({
          enteredLate,
          suspiciousBatch: false,
          locationPresenceConfirmed,
          accuracyMeters: dto.accuracyMeters,
          visitLatitude: dto.latitude!,
          visitLongitude: dto.longitude!,
          canonicalLatitude: point.canonicalLatitude ? Number(point.canonicalLatitude) : null,
          canonicalLongitude: point.canonicalLongitude ? Number(point.canonicalLongitude) : null,
        })
      : { distanceMeters: null, locationLearningEligible: false, locationReviewRequired: false, reviewReason: null };

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
            lateEntryReason: enteredLate ? dto.lateEntryReason!.trim() : null,
            latitude: dateDecision.locationRequired ? new Prisma.Decimal(dto.latitude!) : null,
            longitude: dateDecision.locationRequired ? new Prisma.Decimal(dto.longitude!) : null,
            accuracyMeters:
              dto.accuracyMeters !== undefined ? new Prisma.Decimal(dto.accuracyMeters) : null,
            locationPresenceConfirmed,
            locationCapturedAt: dateDecision.locationRequired ? locationCapturedAt : null,
            locationLearningEligible: locationDecision.locationLearningEligible,
            locationReviewRequired: locationDecision.locationReviewRequired,
            suspiciousBatch: false,
            reviewRecommended: dateDecision.locationRequired && locationDecision.locationReviewRequired,
            reviewReason: [enteredLate ? 'GERİYE DÖNÜK GİRİŞ' : null, locationDecision.reviewReason].filter(Boolean).join(' | ') || null,
            totalCoolerCount,
            maintainedCoolerCount,
            missingMaintenanceCount,
            missingMaintenanceExplanation,
            coolerCount: equipment.coolerCount!,
            towerCount: equipment.towerCount!,
            tapCount: equipment.tapCount!,
            smarttapCount: equipment.smarttapCount!,
            equipmentConfirmed: true,
            confirmationReconciliationEligible: point.maintenanceType === MaintenanceType.STANDARD,
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
        if (enteredLate) {
          await tx.adminAuditLog.create({
            data: {
              actorId: dto.technicianId,
              entityType: 'MAINTENANCE_VISIT',
              entityId: created.id,
              action: 'MAINTENANCE_ENTERED_LATE',
              oldValue: Prisma.JsonNull,
              newValue: { pastDated: true, performedAt: performedAt.toISOString(), lateEntryMinutes, lateEntryReason: dto.lateEntryReason!.trim(), locationCaptured: false },
              note: 'Geriye dönük bakım girişi; konum değerlendirmesi uygulanmadı',
            },
          });
        }

        await tx.adminAuditLog.create({
          data: {
            actorId: dto.technicianId,
            entityType: 'MAINTENANCE_VISIT',
            entityId: created.id,
            action: missingMaintenanceCount > 0
              ? 'MAINTENANCE_PARTIAL_COOLER_COUNT_RECORDED'
              : 'MAINTENANCE_COOLER_COUNT_RECORDED',
            oldValue: Prisma.JsonNull,
            newValue: {
              totalCoolerCount,
              maintainedCoolerCount,
              missingMaintenanceCount,
              missingMaintenanceExplanation,
            },
            note: missingMaintenanceCount > 0
              ? 'Eksik bakım teknisyen tarafından tamamlanmış olarak kaydedildi'
              : 'Bakımı yapılan soğutucu adedi tamamlandı olarak kaydedildi',
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

      if (dateDecision.locationRequired) {
        await this.runPostProcessing(dto.technicianId, point.id, locationPresenceConfirmed);
      }

      const visit =
        (await this.prisma.maintenanceVisit.findUnique({ where: { id: result.visit.id } })) ?? result.visit;
      return { ...visit, pastDated: enteredLate, resolvedBacklogPeriods: result.missedPeriods };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu bakım kaydı zaten işlendi');
      }
      throw error;
    }
  }

  async approveVisitLocation(adminUserId: string, dto: ApproveVisitLocationDto) {
    const [visit, admin] = await Promise.all([
      this.prisma.maintenanceVisit.findUnique({
        where: { id: dto.visitId },
        include: {
          point: {
            select: {
              id: true, canonicalLatitude: true, canonicalLongitude: true,
              locationSource: true, locationConfidence: true,
              googlePlaceId: true, googleBusinessName: true,
            },
          },
        },
      }),
      this.prisma.user.findFirst({ where: { id: adminUserId, active: true } }),
    ]);
    if (!visit) throw new NotFoundException('Bakım kaydı bulunamadı');
    if (!admin || admin.role !== UserRole.ADMIN) throw new ForbiddenException('Konum onayını yalnızca admin verebilir');
    if (visit.status !== VisitStatus.VALID) throw new BadRequestException('Yalnızca geçerli bakım kaydının konumu onaylanabilir');
    if (visit.enteredLate || visit.latitude === null || visit.longitude === null) {
      throw new BadRequestException('Geriye dönük veya konumsuz bakım kaydının konumu onaylanamaz');
    }
    const visitLatitude = visit.latitude;
    const visitLongitude = visit.longitude;

    return this.prisma.$transaction(async (tx) => {
      const point = await tx.point.update({
        where: { id: visit.pointId },
        data: {
          canonicalLatitude: visitLatitude,
          canonicalLongitude: visitLongitude,
          locationSource: LocationSource.MANUAL,
          locationConfidence: 100,
        },
      });
      const updatedVisit = await tx.maintenanceVisit.update({
        where: { id: visit.id },
        data: {
          locationReviewRequired: false,
          // A location approval must not clear unrelated anomaly evidence.
          reviewRecommended: visit.suspiciousBatch || visit.enteredLate,
        },
      });
      const audit = await tx.adminAuditLog.create({
        data: {
          actorId: admin.id,
          entityType: 'POINT_LOCATION',
          entityId: visit.pointId,
          action: 'POINT_LOCATION_CONFIRMED_FROM_VISIT',
          oldValue: {
            canonicalLatitude: visit.point.canonicalLatitude?.toString() ?? null,
            canonicalLongitude: visit.point.canonicalLongitude?.toString() ?? null,
            locationSource: visit.point.locationSource,
            locationConfidence: visit.point.locationConfidence,
          },
          newValue: {
            canonicalLatitude: visitLatitude.toString(),
            canonicalLongitude: visitLongitude.toString(),
            locationSource: LocationSource.MANUAL,
            locationConfidence: 100,
            maintenanceVisitId: visit.id,
          },
          note: dto.note?.trim() || null,
        },
      });
      return { point, visit: updatedVisit, audit };
    });
  }

  async revert(dto: RevertMaintenanceDto, now = new Date()) {
    const [visit, actor] = await Promise.all([
      this.prisma.maintenanceVisit.findUnique({ where: { id: dto.visitId } }),
      this.prisma.user.findFirst({ where: { id: dto.userId, active: true } }),
    ]);
    if (!visit) throw new NotFoundException('Bakım kaydı bulunamadı');
    if (!actor) throw new NotFoundException('Kullanıcı bulunamadı veya pasif');
    if (actor.role !== UserRole.ADMIN && visit.technicianId !== actor.id) {
      throw new ForbiddenException('Teknisyen yalnızca kendi bakım kaydını geri alabilir');
    }
    if (!this.isWithinRevertWindow(visit.recordedAtServer, now)) {
      throw new BadRequestException('Bakım kaydı yalnızca girildiği gün veya ertesi gün geri alınabilir');
    }

    return this.prisma.$transaction(async (tx) => {
      let reverted = visit;
      if (visit.status !== VisitStatus.REVERSED) {
        await tx.maintenanceVisit.updateMany({
          where: { id: visit.id, status: { not: VisitStatus.REVERSED } },
          data: {
            status: VisitStatus.REVERSED,
            reversedAt: now,
            reversedByUserId: actor.id,
            reviewRecommended: true,
            reviewReason: `GERİ ALINDI: ${dto.reason}`,
            locationLearningEligible: false,
          },
        });
        const persisted = await tx.maintenanceVisit.findUnique({ where: { id: visit.id } });
        if (!persisted) throw new NotFoundException('Bakım kaydı bulunamadı');
        reverted = persisted;
      }

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
      throw new ConflictException('Bu kayıt daha önce incelenmiş');
    }

    if (dto.decision === AttemptAdminDecision.REJECTED) {
      return this.prisma.$transaction(async (tx) => {
        const reviewedAt = new Date();
        const claimed = await tx.maintenanceAttempt.updateMany({
          where: { id: attempt.id, reviewStatus: AttemptReviewStatus.PENDING },
          data: { reviewStatus: AttemptReviewStatus.REJECTED, reviewedAt, reviewedById: admin.id, reviewNote: dto.note?.trim() || null },
        });
        if (claimed.count !== 1) throw new ConflictException('Bu kayıt başka bir admin tarafından incelendi');
        const updated = await tx.maintenanceAttempt.findUnique({ where: { id: attempt.id } });
        await tx.adminAuditLog.create({ data: { entityType: 'MAINTENANCE_ATTEMPT', entityId: attempt.id, action: 'REJECTED', actorId: admin.id, note: dto.note?.trim() || null } });
        return { closed: false, attempt: updated };
      });
    }

    let closedDueDate: Date | null = null;
    return this.prisma.$transaction(async (tx) => {
      let closedObligations = 0;
      let openObligationIds: string[] = [];
      if (attempt.point.maintenanceType === MaintenanceType.STANDARD) {
        const dueDate = this.dateOnly(attempt.attemptedAt);
        const open = await tx.maintenanceObligation.findMany({ where: { pointId: attempt.pointId, status: MaintenanceObligationStatus.OPEN, dueStart: { lte: dueDate } }, select: { id: true, dueStart: true } });
        if (open.length) {
          closedDueDate = open.reduce((latest, item) => item.dueStart > latest ? item.dueStart : latest, open[0].dueStart);
          openObligationIds = open.map((item) => item.id);
        }
      } else {
        const base = attempt.point.visits[0]?.performedAt ?? attempt.point.smartcleanReferenceAt;
        if (base && [1, 2].includes(attempt.point.maintenanceWeek ?? 0)) {
          const attemptedDate = this.dateOnly(attempt.attemptedAt);
          let due = nextSmartcleanDueDate(this.dateOnly(base), attempt.point.maintenanceWeek!, this.week1Anchor());
          while (due <= attemptedDate) { closedDueDate = due; due = this.addDays(due, 14); }
        }
      }

      const claimed = await tx.maintenanceAttempt.updateMany({
        where: { id: attempt.id, reviewStatus: AttemptReviewStatus.PENDING },
        data: { reviewStatus: AttemptReviewStatus.APPROVED, reviewedAt: new Date(), reviewedById: admin.id, reviewNote: dto.note?.trim() || null, closedDueDate },
      });
      if (claimed.count !== 1) throw new ConflictException('Bu kayıt başka bir admin tarafından incelendi');
      if (openObligationIds.length) {
        const result = await tx.maintenanceObligation.updateMany({
          where: { id: { in: openObligationIds }, status: MaintenanceObligationStatus.OPEN },
          data: { status: MaintenanceObligationStatus.MISSED, resolvedAt: attempt.attemptedAt, resolvedByAttemptId: attempt.id, completedAt: null },
        });
        closedObligations = result.count;
      }
      const updated = await tx.maintenanceAttempt.findUnique({ where: { id: attempt.id } });
      await tx.adminAuditLog.create({
        data: { entityType: 'MAINTENANCE_ATTEMPT', entityId: attempt.id, action: 'APPROVED_TASK_CLOSED', actorId: admin.id, newValue: { pointId: attempt.pointId, closedObligations, closedDueDate: closedDueDate?.toISOString() ?? null }, note: dto.note?.trim() || null },
      });
      return { closed: true, closedObligations, closedDueDate, attempt: updated };
    });
  }

  async adminTechnicianDailySummary(technicianId: string, dateInput?: string, now = new Date()) {
    if (!technicianId?.trim()) throw new BadRequestException('Teknisyen seçilmelidir');
    this.assertValidDate(now, 'now');
    const dateKey = dateInput ?? businessDateKey(now);
    this.analyticsDate(dateKey, 'date');
    const technician = await this.requireTechnician(technicianId);
    const { start, end } = businessDayRange(new Date(`${dateKey}T12:00:00+03:00`));

    const [due, visits, attempts, nonMaintenanceVisits, prospectVisits] = await Promise.all([
      this.engine.dueSnapshot(dateKey),
      this.prisma.maintenanceVisit.findMany({
        where: {
          status: VisitStatus.VALID,
          performedAt: { gte: start, lt: end },
          OR: [{ technicianId }, { assistedForTechnicianId: technicianId }],
        },
        select: {
          id: true,
          technicianId: true,
          technician: { select: { id: true, name: true, username: true } },
          assistedForTechnicianId: true,
          assistedForTechnician: { select: { id: true, name: true, username: true } },
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
          attemptedAt: { gte: start, lt: end },
          OR: [{ technicianId }, { assistedForTechnicianId: technicianId }],
        },
        select: {
          id: true,
          technicianId: true,
          technician: { select: { id: true, name: true, username: true } },
          assistedForTechnicianId: true,
          assistedForTechnician: { select: { id: true, name: true, username: true } },
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
          technicianId: true,
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
          technicianId: true,
          visitedAt: true,
          purpose: true,
          note: true,
          prospect: { select: { id: true, name: true, sapNo: true, status: true, convertedPointId: true } },
        },
        orderBy: { visitedAt: 'asc' },
      }),
    ]);

    const relation = (actorId: string, assistedForTechnicianId?: string | null) => {
      if (actorId !== technicianId && assistedForTechnicianId === technicianId) return 'RECEIVED_HELP' as const;
      if (actorId === technicianId && assistedForTechnicianId && assistedForTechnicianId !== technicianId) return 'HELPED_OTHER' as const;
      return 'OWN' as const;
    };
    const ownVisits = visits.filter((item) => relation(item.technicianId, item.assistedForTechnicianId) === 'OWN');
    const helpedVisits = visits.filter((item) => relation(item.technicianId, item.assistedForTechnicianId) === 'HELPED_OTHER');
    const receivedVisits = visits.filter((item) => relation(item.technicianId, item.assistedForTechnicianId) === 'RECEIVED_HELP');
    const ownAttempts = attempts.filter((item) => relation(item.technicianId, item.assistedForTechnicianId) === 'OWN');
    const helpedAttempts = attempts.filter((item) => relation(item.technicianId, item.assistedForTechnicianId) === 'HELPED_OTHER');
    const receivedAttempts = attempts.filter((item) => relation(item.technicianId, item.assistedForTechnicianId) === 'RECEIVED_HELP');
    const responsibleVisits = [...ownVisits, ...receivedVisits];
    const paperworkCounts = (kind: 'serviceSlipStatus' | 'confirmationStatus') => ({
      pending: responsibleVisits.filter((item) => item[kind] === PaperworkStatus.PENDING || (kind === 'serviceSlipStatus' && item[kind] === PaperworkStatus.PENDING_REVIEW)).length,
      present: responsibleVisits.filter((item) => item[kind] === PaperworkStatus.PRESENT).length,
      missing: responsibleVisits.filter((item) => item[kind] === PaperworkStatus.MISSING).length,
      approved: responsibleVisits.filter((item) => item[kind] === PaperworkStatus.APPROVED).length,
    });
    const assigned = due.items.filter((item) => item.technicianId === technicianId);
    const events = [
      ...visits.map((item) => ({ type: 'MAINTENANCE' as const, relation: relation(item.technicianId, item.assistedForTechnicianId), at: item.performedAt, ...item })),
      ...attempts.map((item) => ({ type: 'ATTEMPT' as const, relation: relation(item.technicianId, item.assistedForTechnicianId), at: item.attemptedAt, ...item })),
      ...nonMaintenanceVisits.map((item) => ({ type: 'NON_MAINTENANCE_VISIT' as const, relation: 'OWN' as const, at: item.visitedAt, ...item })),
      ...prospectVisits.map((item) => ({ type: 'PROSPECT_VISIT' as const, relation: 'OWN' as const, at: item.visitedAt, ...item })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    return {
      date: dateKey,
      generatedAt: now.toISOString(),
      technician,
      metrics: {
        completedMaintenance: ownVisits.length,
        attemptCount: ownAttempts.length,
        nonMaintenanceVisitCount: nonMaintenanceVisits.length,
        prospectVisitCount: prospectVisits.length,
        currentOpen: assigned.filter((item) => item.priority === 'CURRENT').length,
        overdueOpen: assigned.filter((item) => item.priority === 'OVERDUE').length,
        helpedMaintenance: helpedVisits.length,
        helpedAttempts: helpedAttempts.length,
        receivedHelpMaintenance: receivedVisits.length,
        receivedHelpAttempts: receivedAttempts.length,
      },
      paperwork: {
        serviceSlip: paperworkCounts('serviceSlipStatus'),
        confirmation: paperworkCounts('confirmationStatus'),
      },
      due: assigned,
      events,
    };
  }

  async adminDailySummary(dateInput?: string, now = new Date()) {
    this.assertValidDate(now, 'now');
    const dateKey = dateInput ?? businessDateKey(now);
    this.analyticsDate(dateKey, 'date');
    const { start, end } = businessDayRange(new Date(`${dateKey}T12:00:00+03:00`));

    const [due, technicians, visits, attempts, nonMaintenanceVisits, serviceSlipPending, confirmationPending] = await Promise.all([
      this.engine.due(dateKey),
      this.prisma.user.findMany({
        where: { active: true, role: UserRole.TECHNICIAN },
        select: { id: true, name: true, username: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.maintenanceVisit.findMany({
        where: { status: VisitStatus.VALID, performedAt: { gte: start, lt: end } },
        select: { technicianId: true },
      }),
      this.prisma.maintenanceAttempt.findMany({
        where: { attemptedAt: { gte: start, lt: end } },
        select: { technicianId: true },
      }),
      this.prisma.nonMaintenanceVisit.findMany({
        where: { visitedAt: { gte: start, lt: end } },
        select: { technicianId: true },
      }),
      this.prisma.maintenanceVisit.count({
        where: { status: VisitStatus.VALID, serviceSlipStatus: { in: [PaperworkStatus.PENDING, PaperworkStatus.PENDING_REVIEW] } },
      }),
      this.prisma.maintenanceVisit.count({
        where: { status: VisitStatus.VALID, confirmationStatus: PaperworkStatus.PENDING },
      }),
    ]);

    const byTechnician = new Map(technicians.map((technician) => [technician.id, {
      technicianId: technician.id,
      name: technician.name,
      username: technician.username,
      completedMaintenance: 0,
      attempts: 0,
      nonMaintenanceVisits: 0,
      currentOpen: 0,
      overdueOpen: 0,
    }]));
    const fieldTechnicians = new Set<string>();
    for (const visit of visits) {
      const row = byTechnician.get(visit.technicianId);
      if (row) { row.completedMaintenance += 1; fieldTechnicians.add(visit.technicianId); }
    }
    for (const attempt of attempts) {
      const row = byTechnician.get(attempt.technicianId);
      if (row) { row.attempts += 1; fieldTechnicians.add(attempt.technicianId); }
    }
    for (const visit of nonMaintenanceVisits) {
      const row = byTechnician.get(visit.technicianId);
      if (row) { row.nonMaintenanceVisits += 1; fieldTechnicians.add(visit.technicianId); }
    }
    for (const item of due.items) {
      if (!item.technicianId) continue;
      const row = byTechnician.get(item.technicianId);
      if (!row) continue;
      if (item.priority === 'OVERDUE') row.overdueOpen += 1;
      else row.currentOpen += 1;
    }

    const rows = Array.from(byTechnician.values()).sort((a, b) =>
      b.overdueOpen - a.overdueOpen
      || b.currentOpen - a.currentOpen
      || (b.completedMaintenance + b.attempts + b.nonMaintenanceVisits) - (a.completedMaintenance + a.attempts + a.nonMaintenanceVisits)
      || a.name.localeCompare(b.name, 'tr'),
    );
    const currentOpen = due.items.filter((item) => item.priority === 'CURRENT').length;
    const overdueOpen = due.items.filter((item) => item.priority === 'OVERDUE').length;
    const unassignedOpen = due.items.filter((item) => !item.technicianId).length;

    return {
      date: dateKey,
      generatedAt: now.toISOString(),
      metrics: {
        completedMaintenance: visits.length,
        fieldTechnicianCount: fieldTechnicians.size,
        attemptCount: attempts.length,
        nonMaintenanceVisitCount: nonMaintenanceVisits.length,
        currentOpen,
        overdueOpen,
        unassignedOpen,
        paperworkPending: serviceSlipPending + confirmationPending,
        serviceSlipPending,
        confirmationPending,
      },
      technicians: rows,
    };
  }


  async adminPeriodSummary(dateInput?: string, now = new Date()) {
    this.assertValidDate(now, 'now');
    const dateKey = dateInput ?? businessDateKey(now);
    const selected = this.analyticsDate(dateKey, 'date');
    const mondayOffset = (selected.getUTCDay() + 6) % 7;
    const weekStartDate = new Date(selected);
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() - mondayOffset);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    const weekStart = weekStartDate.toISOString().slice(0, 10);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);
    const today = this.analyticsDate(businessDateKey(now), 'today');
    const currentMondayOffset = (today.getUTCDay() + 6) % 7;
    today.setUTCDate(today.getUTCDate() - currentMondayOffset);
    if (weekStartDate.getTime() > today.getTime()) {
      throw new BadRequestException('Gelecek hafta için dönem özeti oluşturulamaz');
    }
    const start = businessDayRange(new Date(`${weekStart}T12:00:00+03:00`)).start;
    const end = businessDayRange(new Date(`${weekEnd}T12:00:00+03:00`)).end;

    const [due, technicians, visits, attempts, nonMaintenanceVisits, serviceSlipPending, confirmationPending] = await Promise.all([
      this.engine.dueSnapshot(weekEnd),
      this.prisma.user.findMany({
        where: { active: true, role: UserRole.TECHNICIAN },
        select: { id: true, name: true, username: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.maintenanceVisit.findMany({
        where: { status: VisitStatus.VALID, performedAt: { gte: start, lt: end } },
        select: { technicianId: true },
      }),
      this.prisma.maintenanceAttempt.findMany({
        where: { attemptedAt: { gte: start, lt: end } },
        select: { technicianId: true },
      }),
      this.prisma.nonMaintenanceVisit.findMany({
        where: { visitedAt: { gte: start, lt: end } },
        select: { technicianId: true },
      }),
      this.prisma.maintenanceVisit.count({
        where: { status: VisitStatus.VALID, serviceSlipStatus: { in: [PaperworkStatus.PENDING, PaperworkStatus.PENDING_REVIEW] }, recordedAtServer: { lt: end } },
      }),
      this.prisma.maintenanceVisit.count({
        where: { status: VisitStatus.VALID, confirmationStatus: PaperworkStatus.PENDING, recordedAtServer: { lt: end } },
      }),
    ]);

    const byTechnician = new Map(technicians.map((technician) => [technician.id, {
      technicianId: technician.id,
      name: technician.name,
      username: technician.username,
      completedMaintenance: 0,
      attempts: 0,
      nonMaintenanceVisits: 0,
      currentOpen: 0,
      overdueOpen: 0,
    }]));
    const fieldTechnicians = new Set<string>();
    for (const visit of visits) {
      const row = byTechnician.get(visit.technicianId);
      if (row) { row.completedMaintenance += 1; fieldTechnicians.add(visit.technicianId); }
    }
    for (const attempt of attempts) {
      const row = byTechnician.get(attempt.technicianId);
      if (row) { row.attempts += 1; fieldTechnicians.add(attempt.technicianId); }
    }
    for (const visit of nonMaintenanceVisits) {
      const row = byTechnician.get(visit.technicianId);
      if (row) { row.nonMaintenanceVisits += 1; fieldTechnicians.add(visit.technicianId); }
    }
    for (const item of due.items) {
      if (!item.technicianId) continue;
      const row = byTechnician.get(item.technicianId);
      if (!row) continue;
      if (item.priority === 'OVERDUE') row.overdueOpen += 1;
      else row.currentOpen += 1;
    }

    const rows = Array.from(byTechnician.values()).sort((a, b) =>
      b.overdueOpen - a.overdueOpen
      || b.currentOpen - a.currentOpen
      || (b.completedMaintenance + b.attempts + b.nonMaintenanceVisits) - (a.completedMaintenance + a.attempts + a.nonMaintenanceVisits)
      || a.name.localeCompare(b.name, 'tr'),
    );
    const currentOpen = due.items.filter((item) => item.priority === 'CURRENT').length;
    const overdueOpen = due.items.filter((item) => item.priority === 'OVERDUE').length;
    const unassignedOpen = due.items.filter((item) => !item.technicianId).length;

    return {
      selectedDate: dateKey,
      weekStart,
      weekEnd,
      generatedAt: now.toISOString(),
      metrics: {
        completedMaintenance: visits.length,
        fieldTechnicianCount: fieldTechnicians.size,
        attemptCount: attempts.length,
        nonMaintenanceVisitCount: nonMaintenanceVisits.length,
        currentOpen,
        overdueOpen,
        unassignedOpen,
        paperworkPending: serviceSlipPending + confirmationPending,
        serviceSlipPending,
        confirmationPending,
      },
      technicians: rows,
    };
  }

  async paperworkAnalytics(
    query: { from?: string; to?: string; technicianId?: string },
    now = new Date(),
  ) {
    this.assertValidDate(now, 'now');
    const today = businessDateKey(now);
    const toKey = query.to ?? today;
    const fromKey = query.from ?? this.shiftDateKey(toKey, -29);
    const fromDate = this.analyticsDate(fromKey, 'from');
    const toDate = this.analyticsDate(toKey, 'to');
    const inclusiveDays = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    if (inclusiveDays < 1) throw new BadRequestException('Geçersiz tarih aralığı: başlangıç bitişten sonra olamaz');
    if (inclusiveDays > 180) throw new BadRequestException('Evrak analitiği en fazla 180 günlük tarih aralığını destekler');

    const fromInstant = businessDayRange(new Date(`${fromKey}T12:00:00+03:00`)).start;
    const toExclusive = businessDayRange(new Date(`${toKey}T12:00:00+03:00`)).end;
    const visits = await this.prisma.maintenanceVisit.findMany({
      where: {
        status: VisitStatus.VALID,
        recordedAtServer: { gte: fromInstant, lt: toExclusive },
        ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      },
      select: {
        recordedAtServer: true,
        serviceSlipStatus: true,
        confirmationStatus: true,
        paperworkHistory: {
          select: { kind: true, newStatus: true, changedAt: true },
          orderBy: { changedAt: 'asc' },
        },
        confirmationReconciliations: {
          select: {
            id: true,
            importRunId: true,
            previousStatus: true,
            nextStatus: true,
            approvalSource: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const visitsWithSystemHistory = visits.map((visit) => ({
      ...visit,
      paperworkHistory: this.mergePaperworkHistory(visit.paperworkHistory, visit.confirmationReconciliations),
    }));

    return {
      from: fromKey,
      to: toKey,
      technicianId: query.technicianId ?? null,
      generatedAt: now.toISOString(),
      totalVisits: visits.length,
      serviceSlip: this.paperworkKindAnalytics(visitsWithSystemHistory, PaperworkKind.SERVICE_SLIP, 'serviceSlipStatus', now),
      confirmation: this.paperworkKindAnalytics(visitsWithSystemHistory, PaperworkKind.CONFIRMATION, 'confirmationStatus', now),
    };
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
    if (dto.status === PaperworkStatus.PENDING_REVIEW) {
      throw new BadRequestException('İnceleme bekleyen servis fişi yalnızca teknisyen tamamladığında oluşur');
    }
    const previousStatus =
      dto.kind === PaperworkKind.SERVICE_SLIP ? visit.serviceSlipStatus : visit.confirmationStatus;
    if (
      dto.kind === PaperworkKind.SERVICE_SLIP
      && previousStatus === PaperworkStatus.PENDING_REVIEW
      && dto.status !== PaperworkStatus.MISSING
      && dto.status !== PaperworkStatus.APPROVED
    ) {
      throw new BadRequestException('İnceleme bekleyen servis fişi yalnızca Eksik veya Onaylandı yapılabilir');
    }
    const isManualConfirmationApproval =
      dto.kind === PaperworkKind.CONFIRMATION && dto.status === PaperworkStatus.APPROVED;
    if (
      previousStatus === dto.status
      && (!isManualConfirmationApproval
        || visit.confirmationApprovalSource === ConfirmationApprovalSource.MANUAL_ADMIN)
    ) return visit;

    return this.prisma.$transaction(async (tx) => {
      let updated;
      if (dto.kind === PaperworkKind.SERVICE_SLIP) {
        const transition = await tx.maintenanceVisit.updateMany({
          where: {
            id: visit.id,
            status: VisitStatus.VALID,
            serviceSlipStatus: previousStatus,
          },
          data: { serviceSlipStatus: dto.status },
        });
        if (transition.count !== 1) {
          throw new ConflictException('Servis fişi durumu değişmiş; listeyi yenileyip tekrar deneyin');
        }
        updated = await tx.maintenanceVisit.findUnique({ where: { id: visit.id } });
        if (!updated) throw new NotFoundException('Bakım kaydı bulunamadı');
      } else {
        updated = await tx.maintenanceVisit.update({
          where: { id: visit.id },
          data: {
            confirmationStatus: dto.status,
            confirmationApprovalSource: isManualConfirmationApproval
              ? ConfirmationApprovalSource.MANUAL_ADMIN
              : null,
          },
        });
      }

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

      if (dto.kind === PaperworkKind.CONFIRMATION) {
        await tx.adminAuditLog.create({
          data: {
            entityType: 'MAINTENANCE_VISIT',
            entityId: visit.id,
            action: isManualConfirmationApproval
              ? 'CONFIRMATION_MANUALLY_APPROVED'
              : 'CONFIRMATION_STATUS_CHANGED',
            actorId: admin.id,
            oldValue: {
              status: previousStatus,
              approvalSource: visit.confirmationApprovalSource ?? null,
            },
            newValue: {
              status: dto.status,
              approvalSource: isManualConfirmationApproval
                ? ConfirmationApprovalSource.MANUAL_ADMIN
                : null,
            },
            note: dto.note ?? null,
          },
        });
      }

      return updated;
    });
  }

  async completeMissingServiceSlip(dto: CompleteServiceSlipReviewDto & { technicianId: string }) {
    const [technician, visit] = await Promise.all([
      this.requireTechnician(dto.technicianId),
      this.prisma.maintenanceVisit.findUnique({ where: { id: dto.visitId } }),
    ]);
    if (!visit) throw new NotFoundException('Bakım kaydı bulunamadı');
    if (visit.status !== VisitStatus.VALID) {
      throw new BadRequestException('Geri alınmış bakımın servis fişi tamamlanamaz');
    }
    if (visit.technicianId !== technician.id) {
      throw new ForbiddenException('Yalnızca kendi bakımınızdaki servis fişini tamamlayabilirsiniz');
    }
    if (visit.serviceSlipStatus !== PaperworkStatus.MISSING) {
      throw new BadRequestException('Yalnızca eksik servis fişi incelemeye gönderilebilir');
    }

    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.maintenanceVisit.updateMany({
        where: {
          id: visit.id,
          technicianId: technician.id,
          status: VisitStatus.VALID,
          serviceSlipStatus: PaperworkStatus.MISSING,
        },
        data: { serviceSlipStatus: PaperworkStatus.PENDING_REVIEW },
      });
      if (transition.count !== 1) {
        throw new ConflictException('Servis fişi durumu değişmiş; listeyi yenileyip tekrar deneyin');
      }
      await tx.paperworkStatusHistory.create({
        data: {
          visitId: visit.id,
          kind: PaperworkKind.SERVICE_SLIP,
          previousStatus: PaperworkStatus.MISSING,
          newStatus: PaperworkStatus.PENDING_REVIEW,
          changedById: technician.id,
          note: dto.note?.trim() || null,
        },
      });
      const updated = await tx.maintenanceVisit.findUnique({ where: { id: visit.id } });
      if (!updated) throw new NotFoundException('Bakım kaydı bulunamadı');
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

    const [manualHistory, reconciliationHistory] = await Promise.all([
      this.prisma.paperworkStatusHistory.findMany({
        where: { visitId },
        include: { changedBy: { select: { id: true, name: true } } },
        orderBy: { changedAt: 'asc' },
      }),
      this.prisma.sapConfirmationReconciliation.findMany({
        where: { visitId },
        select: {
          id: true,
          importRunId: true,
          previousStatus: true,
          nextStatus: true,
          approvalSource: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const history = this.mergePaperworkHistory(manualHistory, reconciliationHistory);
    return { visit, history };
  }

  async pointPaperworkHistory(pointId: string) {
    const items = await this.prisma.maintenanceVisit.findMany({
      where: { pointId },
      select: {
        id: true,
        performedAt: true,
        recordedAtServer: true,
        status: true,
        serviceSlipStatus: true,
        confirmationStatus: true,
        technician: { select: { id: true, name: true, username: true } },
        paperworkHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { changedAt: 'asc' },
        },
        confirmationReconciliations: {
          select: {
            id: true,
            importRunId: true,
            previousStatus: true,
            nextStatus: true,
            approvalSource: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { performedAt: 'desc' },
      take: 200,
    });
    return {
      count: items.length,
      items: items.map(({ confirmationReconciliations, ...item }) => ({
        ...item,
        paperworkHistory: this.mergePaperworkHistory(item.paperworkHistory, confirmationReconciliations),
      })),
    };
  }

  private mergePaperworkHistory(
    manualHistory: ManualPaperworkEvent[] = [],
    reconciliationHistory: SapReconciliationEvent[] = [],
  ) {
    const manual = manualHistory.map((item) => ({ ...item, provenance: 'MANUAL_USER' as const }));
    const automatic = reconciliationHistory.map((item) => ({
      id: item.id,
      kind: PaperworkKind.CONFIRMATION,
      previousStatus: item.previousStatus,
      newStatus: item.nextStatus,
      changedAt: item.createdAt,
      note: 'SAP otomatik teyit mutabakatı',
      changedBy: null,
      provenance: 'SAP_RECONCILIATION' as const,
      importRunId: item.importRunId,
      approvalSource: item.approvalSource,
    }));
    return [...manual, ...automatic].sort((left, right) =>
      left.changedAt.getTime() - right.changedAt.getTime(),
    );
  }

  private async runPostProcessing(
    technicianId: string,
    pointId: string,
    locationPresenceConfirmed: boolean,
  ) {
    try {
      await this.anomaly.scanTechnician(technicianId, 24);
      if (locationPresenceConfirmed) {
        await this.locationLearning.refreshPoint(pointId);
        await this.googlePlaces.matchPoint(pointId);
      }
    } catch (error) {
      this.logger.warn(
        `Maintenance post-processing failed for point ${pointId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private paperworkKindAnalytics(
    visits: Array<{
      recordedAtServer: Date;
      serviceSlipStatus: PaperworkStatus;
      confirmationStatus: PaperworkStatus;
      paperworkHistory: Array<{ kind: PaperworkKind; newStatus: PaperworkStatus; changedAt: Date }>;
    }>,
    kind: PaperworkKind,
    statusField: 'serviceSlipStatus' | 'confirmationStatus',
    now: Date,
  ) {
    const statusCounts = { pending: 0, present: 0, missing: 0, approved: 0 };
    const pendingAgeBuckets = { under24h: 0, h24to48: 0, d2to7: 0, d7plus: 0 };
    const arrivalDurations: number[] = [];
    const resolutionDurations: number[] = [];

    for (const visit of visits) {
      const status = visit[statusField];
      const isPending = status === PaperworkStatus.PENDING || (kind === PaperworkKind.SERVICE_SLIP && status === PaperworkStatus.PENDING_REVIEW);
      if (isPending) statusCounts.pending += 1;
      else if (status === PaperworkStatus.PRESENT) statusCounts.present += 1;
      else if (status === PaperworkStatus.MISSING) statusCounts.missing += 1;
      else statusCounts.approved += 1;

      if (isPending) {
        const ageHours = Math.max(0, now.getTime() - visit.recordedAtServer.getTime()) / 3_600_000;
        if (ageHours < 24) pendingAgeBuckets.under24h += 1;
        else if (ageHours < 48) pendingAgeBuckets.h24to48 += 1;
        else if (ageHours < 168) pendingAgeBuckets.d2to7 += 1;
        else pendingAgeBuckets.d7plus += 1;
      }

      const validHistory = visit.paperworkHistory
        .filter((item) => item.kind === kind && item.changedAt.getTime() >= visit.recordedAtServer.getTime())
        .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
      const arrival = validHistory.find((item) =>
        item.newStatus === PaperworkStatus.PRESENT || item.newStatus === PaperworkStatus.APPROVED,
      );
      const resolution = validHistory.find((item) =>
        item.newStatus === PaperworkStatus.PRESENT
        || item.newStatus === PaperworkStatus.MISSING
        || item.newStatus === PaperworkStatus.APPROVED,
      );
      if (arrival) arrivalDurations.push(arrival.changedAt.getTime() - visit.recordedAtServer.getTime());
      if (resolution) resolutionDurations.push(resolution.changedAt.getTime() - visit.recordedAtServer.getTime());
    }

    const total = visits.length;
    return {
      statusCounts,
      statusRates: {
        pending: this.rate(statusCounts.pending, total),
        present: this.rate(statusCounts.present, total),
        missing: this.rate(statusCounts.missing, total),
        approved: this.rate(statusCounts.approved, total),
      },
      arrival: this.durationSummary(arrivalDurations, 'completedCount'),
      resolution: this.durationSummary(resolutionDurations, 'resolvedCount'),
      pendingAgeBuckets,
    };
  }

  private durationSummary(valuesMs: number[], countKey: 'completedCount' | 'resolvedCount') {
    const sorted = [...valuesMs].sort((a, b) => a - b);
    const percentile = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
    let medianMs: number | null = null;
    if (sorted.length) {
      const mid = Math.floor(sorted.length / 2);
      medianMs = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return {
      [countKey]: sorted.length,
      medianMinutes: medianMs === null ? null : Math.round(medianMs / 60_000),
      p90Minutes: percentile(0.9) === null ? null : Math.round(percentile(0.9)! / 60_000),
    };
  }

  private rate(count: number, total: number) {
    return total ? Math.round((count / total) * 1000) / 10 : 0;
  }

  private analyticsDate(key: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new BadRequestException(`${field} YYYY-MM-DD formatında olmalıdır`);
    const parsed = new Date(`${key}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== key) {
      throw new BadRequestException(`${field} geçersiz tarih`);
    }
    return parsed;
  }

  private shiftDateKey(key: string, days: number) {
    const date = this.analyticsDate(key, 'date');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private previousBusinessDateKey(key: string) {
    const date = new Date(`${key}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  private isWithinRevertWindow(recordedAtServer: Date, now: Date) {
    const today = businessDateKey(now);
    const recordedDate = businessDateKey(recordedAtServer);
    return recordedDate === today || recordedDate === this.previousBusinessDateKey(today);
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
