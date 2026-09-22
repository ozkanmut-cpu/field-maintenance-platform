import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    recordedAtServer: new Date('2026-09-20T08:00:00.000Z'),
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

  const result = await serviceWith(prisma).revert(
    {
      visitId: visit.id,
      userId: 'technician-1',
      reason: 'Yanlış deneme kaydı',
    },
    new Date('2026-09-20T20:59:59.000Z'),
  );

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
    recordedAtServer: new Date('2026-09-20T08:00:00.000Z'),
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
    recordedAtServer: new Date('2026-09-20T08:00:00.000Z'),
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

  const result = await serviceWith(prisma).revert(
    {
      visitId: staleVisit.id,
      userId: 'technician-1',
      reason: 'İkinci istek',
    },
    new Date('2026-09-20T20:59:59.000Z'),
  );

  assert.equal(result, winningVisit);
  assert.equal(visitUpdateManyCalls.length, 1);
  assert.deepEqual(visitUpdateManyCalls[0].where, {
    id: staleVisit.id,
    status: { not: VisitStatus.REVERSED },
  });
});

test('a technician can revert a visit entered yesterday in the Istanbul business day', async () => {
  const visit = {
    id: 'visit-yesterday', obligationId: null, technicianId: 'technician-1', status: VisitStatus.VALID,
    recordedAtServer: new Date('2026-09-19T20:59:59.000Z'), // 23:59:59 Istanbul
  };
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: 'technician-1', role: UserRole.TECHNICIAN }) },
    $transaction: async (operation: (tx: any) => Promise<unknown>) => operation({
      maintenanceVisit: { updateMany: async () => ({ count: 1 }), findUnique: async () => ({ ...visit, status: VisitStatus.REVERSED }) },
      maintenanceObligation: { updateMany: async () => ({ count: 0 }) },
    }),
  };

  const result = await serviceWith(prisma).revert(
    { visitId: visit.id, userId: 'technician-1', reason: 'Dün girilen kayıt' },
    new Date('2026-09-20T20:59:59.000Z'),
  );

  assert.equal((result as any).status, VisitStatus.REVERSED);
});

test('revert rejects a visit entered before yesterday, using the Istanbul business day', async () => {
  const visit = {
    id: 'visit-expired', obligationId: null, technicianId: 'technician-1', status: VisitStatus.VALID,
    recordedAtServer: new Date('2026-09-18T20:59:59.000Z'), // 23:59:59 Istanbul, two days ago
  };
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: 'technician-1', role: UserRole.TECHNICIAN }) },
    $transaction: async () => assert.fail('expired visit must not start a transaction'),
  };

  await assert.rejects(
    serviceWith(prisma).revert(
      { visitId: visit.id, userId: 'technician-1', reason: 'Süresi geçmiş kayıt' },
      new Date('2026-09-20T20:59:59.000Z'),
    ),
    BadRequestException,
  );
});
