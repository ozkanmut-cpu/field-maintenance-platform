import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfirmationApprovalSource, MaintenanceType, PaperworkStatus, SapImportSource, VisitStatus } from '@prisma/client';
import { businessDateKey, businessDayRange } from '../common/business-time';
import { PrismaService } from '../prisma/prisma.service';

type ReconcileResult = { processed: boolean; reason?: string; importRunId?: string; updated?: number };

/** Consumes only a committed MAIN_CONFIRMATION_203 receipt; failed/dry runs have none. */
@Injectable()
export class SapConfirmationReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SapConfirmationReconciliationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // SAP imports occur about every ten minutes. A short bounded poll gives an already
    // committed receipt low latency without adding an API endpoint or parallel workers.
    this.timer = setInterval(() => void this.poll(), 60_000);
    void this.poll();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
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

  async reconcileNext(): Promise<ReconcileResult> {
    const claimExpiredBefore = new Date(Date.now() - 5 * 60_000);
    const run = await this.prisma.sapImportRun.findFirst({
      where: {
        source: SapImportSource.MAIN_CONFIRMATION_203, reconciledAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: claimExpiredBefore } }],
      },
      orderBy: { completedAt: 'asc' },
    });
    if (!run) return { processed: false, reason: 'NO_SUCCESSFUL_IMPORT' };
    const claim = await this.prisma.sapImportRun.updateMany({
      where: {
        id: run.id, reconciledAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: claimExpiredBefore } }],
      }, data: { claimedAt: new Date() },
    });
    if (claim.count !== 1) return { processed: false, reason: 'IMPORT_ALREADY_CLAIMED' };
    try {
      const updated = await this.reconcileRun(run);
      return { processed: true, importRunId: run.id, updated };
    } catch (error) {
      await this.prisma.sapImportRun.update({ where: { id: run.id }, data: { claimedAt: null } });
      this.logger.error(`SAP teyit mutabakatı ${run.id} için tamamlanamadı`, error as Error);
      throw error;
    }
  }

  private async reconcileRun(run: { id: string; windowStart: Date; windowEnd: Date; completedAt: Date }) {
    return this.prisma.$transaction(async (tx) => {
      // Prisma's interactive transaction generic intentionally erases relation payloads.
      // Keep the query shape explicit while retaining the transaction boundary.
      const db: any = tx;
      const visitWindow = { start: businessDayRange(run.windowStart).start, end: businessDayRange(run.windowEnd).end };
      const visits = await db.maintenanceVisit.findMany({
        where: {
          status: VisitStatus.VALID, confirmationReconciliationEligible: true,
          recordedAtServer: { lt: run.completedAt }, performedAt: { gte: visitWindow.start, lt: visitWindow.end },
          point: { maintenanceType: MaintenanceType.STANDARD },
        },
        select: {
          id: true, performedAt: true, coolerCount: true, confirmationStatus: true,
          confirmationApprovalSource: true, point: { select: { code: true } },
        },
      });
      const candidates = visits.filter((visit: any) =>
        visit.coolerCount !== null && visit.coolerCount > 0 && visit.point.code &&
        businessDateKey(visit.performedAt) >= businessDateKey(run.windowStart) &&
        businessDateKey(visit.performedAt) <= businessDateKey(run.windowEnd) &&
        visit.confirmationApprovalSource !== ConfirmationApprovalSource.MANUAL_ADMIN,
      );
      if (!candidates.length) {
        await db.sapImportRun.update({ where: { id: run.id }, data: { reconciledAt: new Date() } });
        return 0;
      }
      const rows = await db.sapConfirmation.findMany({
        where: {
          lastSeenImportId: run.id, productId: '203',
          pointCode: { in: [...new Set(candidates.map((visit: any) => visit.point.code!))] },
          recordDate: { gte: run.windowStart, lte: run.windowEnd },
        }, select: { pointCode: true, recordDate: true, status: true },
      });
      let updated = 0;
      for (const visit of candidates) {
        const matching = rows.filter((row: any) => row.pointCode === visit.point.code && businessDateKey(row.recordDate) === businessDateKey(visit.performedAt));
        const nextStatus = matching.length < visit.coolerCount!
          ? PaperworkStatus.MISSING
          : matching.every((row: any) => normaliseSapStatus(row.status) === '*ONAY BEKLIYOR')
            ? PaperworkStatus.PRESENT : PaperworkStatus.APPROVED;
        const approvalSource = nextStatus === PaperworkStatus.APPROVED ? ConfirmationApprovalSource.AUTO_SAP : null;
        if (visit.confirmationStatus !== nextStatus || visit.confirmationApprovalSource !== approvalSource) {
          await db.maintenanceVisit.update({
            where: { id: visit.id },
            data: { confirmationStatus: nextStatus, confirmationApprovalSource: approvalSource, confirmationReconciledAt: new Date() },
          });
          await db.sapConfirmationReconciliation.create({
            data: { importRunId: run.id, visitId: visit.id, previousStatus: visit.confirmationStatus,
              nextStatus, approvalSource, sapCount: matching.length, coolerCount: visit.coolerCount! },
          });
          updated += 1;
        }
      }
      await db.sapImportRun.update({ where: { id: run.id }, data: { reconciledAt: new Date() } });
      return updated;
    });
  }
}

function normaliseSapStatus(value: string | null) {
  return (value ?? '').trim().toLocaleUpperCase('tr-TR');
}
