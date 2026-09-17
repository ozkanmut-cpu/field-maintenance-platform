import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { MaintenanceObligationStatus, UserRole, VisitStatus } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

function serviceWith(prisma: any) {
  return new MaintenanceService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

test('revert repairs obligations when the visit is already reversed', async () => {
  const visit = {
    id: 'visit-1',
    obligationId: 'obligation-1',
    technicianId: 'technician-1',
    status: VisitStatus.REVERSED,
  };
  const obligationUpdates: any[] = [];
  const prisma: any = {
    maintenanceVisit: {
      findUnique: async () => visit,
    },
    user: {
      findFirst: async () => ({ id: 'technician-1', role: UserRole.TECHNICIAN }),
    },
    $transaction: async (operation: (tx: any) => Promise<unknown>) => operation({
      maintenanceVisit: {
        update: async () => assert.fail('an already reversed visit must not be rewritten'),
      },
      maintenanceObligation: {
        updateMany: async (args: any) => {
          obligationUpdates.push(args);
          return { count: 1 };
        },
      },
    }),
  };

  const result = await serviceWith(prisma).revert({
    visitId: visit.id,
    userId: 'technician-1',
    reason: 'Yanlış deneme kaydı',
  });

  assert.equal(result, visit);
  assert.equal(obligationUpdates.length, 1);
  assert.deepEqual(obligationUpdates[0].where, { resolvedByVisitId: visit.id });
  assert.deepEqual(obligationUpdates[0].data, {
    status: MaintenanceObligationStatus.OPEN,
    completedAt: null,
    resolvedAt: null,
    resolvedByVisitId: null,
  });
});

test('an unrelated technician cannot repair an already reversed visit', async () => {
  const visit = {
    id: 'visit-1',
    obligationId: 'obligation-1',
    technicianId: 'technician-1',
    status: VisitStatus.REVERSED,
  };
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: {
      findFirst: async () => ({ id: 'technician-2', role: UserRole.TECHNICIAN }),
    },
    $transaction: async () => assert.fail('unauthorized repair must not start a transaction'),
  };

  await assert.rejects(
    serviceWith(prisma).revert({
      visitId: visit.id,
      userId: 'technician-2',
      reason: 'Yetkisiz tekrar deneme',
    }),
    ForbiddenException,
  );
});

test('a concurrent revert loser does not overwrite the winning reversal metadata', async () => {
  const staleVisit = {
    id: 'visit-1',
    obligationId: 'obligation-1',
    technicianId: 'technician-1',
    status: VisitStatus.VALID,
  };
  const winningVisit = {
    ...staleVisit,
    status: VisitStatus.REVERSED,
    reversedAt: new Date('2026-09-17T10:00:00.000Z'),
    reversedByUserId: 'technician-1',
    reviewReason: 'GERİ ALINDI: İlk istek',
  };
  const visitUpdateManyCalls: any[] = [];
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => staleVisit },
    user: {
      findFirst: async () => ({ id: 'technician-1', role: UserRole.TECHNICIAN }),
    },
    $transaction: async (operation: (tx: any) => Promise<unknown>) => operation({
      maintenanceVisit: {
        update: async () => assert.fail('revert must use a status-guarded update'),
        updateMany: async (args: any) => {
          visitUpdateManyCalls.push(args);
          return { count: 0 };
        },
        findUnique: async () => winningVisit,
      },
      maintenanceObligation: {
        updateMany: async () => ({ count: 1 }),
      },
    }),
  };

  const result = await serviceWith(prisma).revert({
    visitId: staleVisit.id,
    userId: 'technician-1',
    reason: 'İkinci istek',
  });

  assert.equal(result, winningVisit);
  assert.equal(visitUpdateManyCalls.length, 1);
  assert.deepEqual(visitUpdateManyCalls[0].where, {
    id: staleVisit.id,
    status: { not: VisitStatus.REVERSED },
  });
});
