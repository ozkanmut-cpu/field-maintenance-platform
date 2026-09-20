import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConfirmationApprovalSource,
  PaperworkStatus,
  SapImportRunStatus,
  SapImportSource,
  VisitStatus,
} from '@prisma/client';
import { businessDateKey, businessDayRange, dateOnlyForBusinessDate } from '../common/business-time';
import { PrismaService } from '../prisma/prisma.service';

type ReconcileResult = {
  processed: boolean;
  reason?: string;
  importRunId?: string;
  updated: number;
};

type CommittedRun = {
  id: string;
  source: SapImportSource;
  status: SapImportRunStatus;
  windowStart: Date;
  windowEnd: Date;
  acquiredAt: Date;
  completedAt: Date;
  reconciledAt: Date | null;
};

@Injectable()
export class SapConfirmationReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SapConfirmationReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.poll(), 60_000);
    void this.poll();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcileNext(): Promise<ReconcileResult> {
    const claimExpiredBefore = new Date(Date.now() - 5 * 60_000);
    const run = await this.prisma.sapImportRun.findFirst({
      where: {
        source: SapImportSource.MAIN_CONFIRMATION_203,
        status: SapImportRunStatus.SUCCESS,
        reconciledAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: claimExpiredBefore } }],
      },
      orderBy: { completedAt: 'asc' },
      select: {
        id: true,
        source: true,
        status: true,
        windowStart: true,
        windowEnd: true,
        acquiredAt: true,
        completedAt: true,
        reconciledAt: true,
      },
    });
    if (!run) return { processed: false, reason: 'NO_SUCCESSFUL_IMPORT', updated: 0 };
    return this.reconcileCommittedImport(run.id);
  }

  async reconcileCommittedImport(importRunId: string): Promise<ReconcileResult> {
    const run = await this.prisma.sapImportRun.findUnique({
      where: { id: importRunId },
      select: {
        id: true,
        source: true,
        status: true,
        windowStart: true,
        windowEnd: true,
        acquiredAt: true,
        completedAt: true,
        reconciledAt: true,
      },
    });
    if (
      !run
      || run.source !== SapImportSource.MAIN_CONFIRMATION_203
      || run.status !== SapImportRunStatus.SUCCESS
      || run.reconciledAt
    ) {
      return { processed: false, reason: 'IMPORT_NOT_COMMITTED', updated: 0 };
    }

    const claimExpiredBefore = new Date(Date.now() - 5 * 60_000);
    const claim = await this.prisma.sapImportRun.updateMany({
      where: {
        id: run.id,
        status: SapImportRunStatus.SUCCESS,
        reconciledAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: claimExpiredBefore } }],
      },
      data: { claimedAt: new Date() },
    });
    if (claim.count !== 1) return { processed: false, reason: 'IMPORT_ALREADY_CLAIMED', updated: 0 };

    try {
      const updated = await this.reconcileRun(run);
      return { processed: true, importRunId: run.id, updated };
    } catch (error) {
      await this.prisma.sapImportRun.update({
        where: { id: run.id },
        data: { claimedAt: null },
      });
      throw error;
    }
  }

  private async poll() {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcileNext();
    } catch (error) {
      this.logger.error('SAP teyit mutabakatı yeniden denenecek', error as Error);
    } finally {
      this.running = false;
    }
  }

  private async reconcileRun(run: CommittedRun) {
    return this.prisma.$transaction(async (transaction) => {
      const tx: any = transaction;
      const windowStart = businessDayRange(run.windowStart).start;
      const windowEnd = businessDayRange(run.windowEnd).end;
      const visits = await tx.maintenanceVisit.findMany({
        where: {
          status: VisitStatus.VALID,
          confirmationReconciliationEligible: true,
          recordedAtServer: { lt: run.acquiredAt },
          performedAt: { gte: windowStart, lt: windowEnd },
        },
        select: {
          id: true,
          performedAt: true,
          coolerCount: true,
          maintainedCoolerCount: true,
          status: true,
          confirmationReconciliationEligible: true,
          confirmationStatus: true,
          confirmationApprovalSource: true,
          confirmationEvidenceAcquiredAt: true,
          confirmationEvidenceImportRunId: true,
          point: { select: { code: true } },
        },
      });
      const candidates = visits.filter((visit: any) =>
        (visit.maintainedCoolerCount ?? visit.coolerCount) !== null
        && (visit.maintainedCoolerCount ?? visit.coolerCount) > 0
        && Boolean(visit.point.code)
        && visit.confirmationApprovalSource !== ConfirmationApprovalSource.MANUAL_ADMIN,
      );

      const confirmations = candidates.length
        ? await tx.sapConfirmationImportEvidence.findMany({
            where: {
              importRunId: run.id,
              productId: '203',
              pointCode: { in: [...new Set(candidates.map((visit: any) => visit.point.code))] },
              recordDate: { gte: run.windowStart, lte: run.windowEnd },
            },
            select: { pointCode: true, recordDate: true, status: true },
          })
        : [];

      let updated = 0;
      for (const visit of candidates) {
        const maintenanceDate = businessDateKey(visit.performedAt);
        const matching = confirmations.filter((row: any) =>
          row.pointCode === visit.point.code && businessDateKey(row.recordDate) === maintenanceDate,
        );
        const approvedCount = matching.filter((row: any) => !isSapPending(row.status)).length;
        // Track C owns capture/UI; null retains the legacy total-cooler behavior.
        const requiredCount = (visit.maintainedCoolerCount ?? visit.coolerCount) as number;
        const nextStatus = matching.length < requiredCount
          ? PaperworkStatus.MISSING
          : approvedCount >= requiredCount
            ? PaperworkStatus.APPROVED
            : PaperworkStatus.PRESENT;
        const approvalSource = nextStatus === PaperworkStatus.APPROVED
          ? ConfirmationApprovalSource.AUTO_SAP
          : null;

        const stateChanged = !(
          visit.confirmationStatus === nextStatus
          && visit.confirmationApprovalSource === approvalSource
        );

        const reconciledAt = new Date();
        const write = await tx.maintenanceVisit.updateMany({
          where: {
            id: visit.id,
            status: VisitStatus.VALID,
            confirmationReconciliationEligible: true,
            confirmationStatus: visit.confirmationStatus,
            confirmationApprovalSource: visit.confirmationApprovalSource,
            OR: [
              { confirmationEvidenceAcquiredAt: null },
              { confirmationEvidenceAcquiredAt: { lt: run.acquiredAt } },
              {
                confirmationEvidenceAcquiredAt: run.acquiredAt,
                OR: [
                  { confirmationEvidenceImportRunId: null },
                  { confirmationEvidenceImportRunId: { lt: run.id } },
                ],
              },
            ],
          },
          data: {
            confirmationStatus: nextStatus,
            confirmationApprovalSource: approvalSource,
            confirmationReconciledAt: reconciledAt,
            confirmationEvidenceAcquiredAt: run.acquiredAt,
            confirmationEvidenceImportRunId: run.id,
          },
        });
        if (write.count !== 1) continue;
        if (!stateChanged) continue;
        await tx.sapConfirmationReconciliation.create({
          data: {
            importRunId: run.id,
            visitId: visit.id,
            previousStatus: visit.confirmationStatus,
            nextStatus,
            approvalSource,
            sapCount: matching.length,
            requiredConfirmationCount: requiredCount,
            maintenanceDate: dateOnlyForBusinessDate(visit.performedAt),
          },
        });
        updated += 1;
      }

      await tx.sapImportRun.update({
        where: { id: run.id },
        data: { reconciledAt: new Date(), claimedAt: null },
      });
      return updated;
    });
  }
}

function isSapPending(value: string | null) {
  return (value ?? '').trim().toLocaleLowerCase('tr-TR') === '*onay bekliyor';
}
