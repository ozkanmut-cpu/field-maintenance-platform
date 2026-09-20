import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { AttemptReviewStatus, MaintenanceObligationStatus, MaintenanceType, UserRole } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';
import { AttemptAdminDecision } from './dto/review-attempt.dto';

function harness() {
  let status = AttemptReviewStatus.PENDING;
  const audits: any[] = [];
  const obligationUpdates: any[] = [];
  const attempt = {
    id: 'attempt-1', pointId: 'point-1', attemptedAt: new Date('2026-09-20T08:00:00.000Z'),
    reviewStatus: AttemptReviewStatus.PENDING,
    point: { maintenanceType: MaintenanceType.STANDARD, visits: [] },
  };
  const prisma: any = {
    user: { findFirst: async () => ({ id: 'admin-1', name: 'Admin', role: UserRole.ADMIN }) },
    maintenanceAttempt: {
      findUnique: async () => ({ ...attempt, reviewStatus: status }),
      update: async () => assert.fail('review must not use an unguarded attempt update'),
      updateMany: async ({ where, data }: any) => {
        if (status !== where.reviewStatus) return { count: 0 };
        status = data.reviewStatus;
        return { count: 1 };
      },
    },
    maintenanceObligation: {
      findMany: async () => [{ id: 'obligation-1', dueStart: new Date('2026-09-15T00:00:00.000Z') }],
      updateMany: async (args: any) => { obligationUpdates.push(args); return { count: 1 }; },
    },
    adminAuditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
    $transaction: async (operation: (tx: any) => Promise<unknown>) => operation(prisma),
  };
  const service = new MaintenanceService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any) as any;
  return { service, audits, obligationUpdates, status: () => status };
}

test('only the first concurrent approved attempt review closes obligations and writes audit', async () => {
  const h = harness();
  const dto = { attemptId: 'attempt-1', decision: AttemptAdminDecision.APPROVED };

  const results = await Promise.allSettled([
    h.service.reviewAttempt('admin-1', dto),
    h.service.reviewAttempt('admin-1', dto),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.ok((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason instanceof ConflictException);
  assert.equal(h.status(), AttemptReviewStatus.APPROVED);
  assert.equal(h.obligationUpdates.length, 1);
  assert.equal(h.audits.length, 1);
});

test('a stale rejected attempt review does not overwrite the winner or write another audit', async () => {
  const h = harness();
  await h.service.reviewAttempt('admin-1', { attemptId: 'attempt-1', decision: AttemptAdminDecision.APPROVED });

  await assert.rejects(
    () => h.service.reviewAttempt('admin-1', { attemptId: 'attempt-1', decision: AttemptAdminDecision.REJECTED }),
    ConflictException,
  );
  assert.equal(h.status(), AttemptReviewStatus.APPROVED);
  assert.equal(h.obligationUpdates.length, 1);
  assert.equal(h.audits.length, 1);
});
