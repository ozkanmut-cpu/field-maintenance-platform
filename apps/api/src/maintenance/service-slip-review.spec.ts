import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PaperworkKind, PaperworkStatus, UserRole, VisitStatus } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

function reviewHarness(input: {
  visit?: Record<string, unknown> | null;
  technician?: { id: string; name: string } | null;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const compareAndSwap: Array<Record<string, unknown>> = [];
  const history: Array<Record<string, unknown>> = [];
  let visit: Record<string, any> | null = input.visit ?? {
    id: 'visit-1', technicianId: 'tech-1', status: VisitStatus.VALID,
    serviceSlipStatus: PaperworkStatus.MISSING,
    confirmationStatus: PaperworkStatus.MISSING,
  };
  const prisma: any = {
    user: {
      findFirst: async ({ where }: any) => where.role === UserRole.TECHNICIAN
        ? input.technician ?? { id: 'tech-1', name: 'Teknisyen' }
        : { id: 'admin-1', name: 'Yönetici', role: UserRole.ADMIN },
    },
    maintenanceVisit: {
      findUnique: async () => visit,
      update: async ({ data }: any) => {
        updates.push(data);
        visit = { ...visit, ...data };
        return visit;
      },
      updateMany: async ({ where, data }: any) => {
        compareAndSwap.push({ where, data });
        if (
          !visit
          || visit.id !== where.id
          || (where.technicianId !== undefined && visit.technicianId !== where.technicianId)
          || visit.status !== where.status
          || visit.serviceSlipStatus !== where.serviceSlipStatus
        ) return { count: 0 };
        visit = { ...visit, ...data };
        return { count: 1 };
      },
    },
    paperworkStatusHistory: {
      create: async ({ data }: any) => { history.push(data); return data; },
    },
    $transaction: async (callback: (tx: unknown) => unknown) => callback(prisma),
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never) as any;
  return { service, updates, compareAndSwap, history };
}

test('a visit owner can hand only a missing service slip to admin review with completion evidence', async () => {
  const h = reviewHarness({});

  const result = await h.service.completeMissingServiceSlip({
    visitId: 'visit-1', technicianId: 'tech-1', note: 'Fiziksel fiş tamamlandı',
  });

  assert.equal(result.serviceSlipStatus, PaperworkStatus.PENDING_REVIEW);
  assert.deepEqual(h.compareAndSwap, [{
    where: { id: 'visit-1', technicianId: 'tech-1', status: VisitStatus.VALID, serviceSlipStatus: PaperworkStatus.MISSING },
    data: { serviceSlipStatus: PaperworkStatus.PENDING_REVIEW },
  }]);
  assert.deepEqual(h.history, [{
    visitId: 'visit-1',
    kind: PaperworkKind.SERVICE_SLIP,
    previousStatus: PaperworkStatus.MISSING,
    newStatus: PaperworkStatus.PENDING_REVIEW,
    changedById: 'tech-1',
    note: 'Fiziksel fiş tamamlandı',
  }]);
});

test('a technician cannot hand another technician’s or a non-missing service slip to review', async () => {
  const wrongOwner = reviewHarness({ visit: {
    id: 'visit-1', technicianId: 'tech-2', status: VisitStatus.VALID,
    serviceSlipStatus: PaperworkStatus.MISSING, confirmationStatus: PaperworkStatus.PENDING,
  } });
  await assert.rejects(
    () => wrongOwner.service.completeMissingServiceSlip({ visitId: 'visit-1', technicianId: 'tech-1' }),
    /yalnızca kendi/i,
  );

  const notMissing = reviewHarness({ visit: {
    id: 'visit-1', technicianId: 'tech-1', status: VisitStatus.VALID,
    serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.MISSING,
  } });
  await assert.rejects(
    () => notMissing.service.completeMissingServiceSlip({ visitId: 'visit-1', technicianId: 'tech-1' }),
    /yalnızca eksik/i,
  );
  assert.equal(notMissing.updates.length, 0);
  assert.equal(notMissing.history.length, 0);
});

test('admin-only paperwork controls retain final control after a technician handoff', async () => {
  const { MaintenanceController } = await import('./maintenance.controller');
  const { ROLES_KEY } = await import('../auth/auth.constants');
  const maintenance: any = { completeMissingServiceSlip: async () => ({ serviceSlipStatus: PaperworkStatus.PENDING_REVIEW }) };
  const controller: any = new MaintenanceController(maintenance, {} as never, {} as never, {} as never, {} as never, {} as never);

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, controller.completeMissingServiceSlip), [UserRole.TECHNICIAN]);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, controller.paperwork), [UserRole.ADMIN]);
  assert.equal((await controller.completeMissingServiceSlip({ id: 'tech-1' }, { visitId: 'visit-1' })).serviceSlipStatus, PaperworkStatus.PENDING_REVIEW);
});

test('admin paperwork updates cannot create a pending review for either service slips or confirmations', async () => {
  const h = reviewHarness({});
  for (const kind of [PaperworkKind.SERVICE_SLIP, PaperworkKind.CONFIRMATION]) {
    await assert.rejects(
      () => h.service.updatePaperwork({ visitId: 'visit-1', adminUserId: 'admin-1', kind, status: PaperworkStatus.PENDING_REVIEW }),
      /yalnızca teknisyen/i,
    );
  }
});

test('admin resolves a pending-review service slip only to MISSING or APPROVED', async () => {
  for (const status of [PaperworkStatus.MISSING, PaperworkStatus.APPROVED]) {
    const h = reviewHarness({ visit: {
      id: 'visit-1', technicianId: 'tech-1', status: VisitStatus.VALID,
      serviceSlipStatus: PaperworkStatus.PENDING_REVIEW,
      confirmationStatus: PaperworkStatus.MISSING,
      confirmationApprovalSource: null,
    } });

    const result = await h.service.updatePaperwork({
      visitId: 'visit-1', adminUserId: 'admin-1', kind: PaperworkKind.SERVICE_SLIP, status,
    });

    assert.equal(result.serviceSlipStatus, status);
    assert.deepEqual(h.compareAndSwap, [{
      where: {
        id: 'visit-1',
        status: VisitStatus.VALID,
        serviceSlipStatus: PaperworkStatus.PENDING_REVIEW,
      },
      data: { serviceSlipStatus: status },
    }]);
    assert.equal(h.updates.length, 0);
    assert.equal(h.history[0].newStatus, status);
  }

  for (const status of [PaperworkStatus.PENDING, PaperworkStatus.PRESENT]) {
    const h = reviewHarness({ visit: {
      id: 'visit-1', technicianId: 'tech-1', status: VisitStatus.VALID,
      serviceSlipStatus: PaperworkStatus.PENDING_REVIEW,
      confirmationStatus: PaperworkStatus.MISSING,
      confirmationApprovalSource: null,
    } });

    await assert.rejects(
      () => h.service.updatePaperwork({
        visitId: 'visit-1', adminUserId: 'admin-1', kind: PaperworkKind.SERVICE_SLIP, status,
      }),
      /eksik veya onaylandı/i,
    );
    assert.equal(h.updates.length, 0);
    assert.equal(h.history.length, 0);
  }
});

test('a concurrent technician handoff cannot be overwritten by a stale admin service-slip decision', async () => {
  let liveStatus: PaperworkStatus = PaperworkStatus.PENDING;
  const history: any[] = [];
  const prisma: any = {
    user: { findFirst: async () => ({ id: 'admin-1', role: UserRole.ADMIN, active: true }) },
    maintenanceVisit: {
      findUnique: async () => ({
        id: 'visit-1', technicianId: 'tech-1', status: VisitStatus.VALID,
        serviceSlipStatus: liveStatus,
        confirmationStatus: PaperworkStatus.MISSING,
        confirmationApprovalSource: null,
      }),
      update: async ({ data }: any) => {
        liveStatus = data.serviceSlipStatus;
        return { id: 'visit-1', serviceSlipStatus: liveStatus };
      },
      updateMany: async ({ where, data }: any) => {
        if (liveStatus !== where.serviceSlipStatus) return { count: 0 };
        liveStatus = data.serviceSlipStatus;
        return { count: 1 };
      },
    },
    paperworkStatusHistory: { create: async ({ data }: any) => { history.push(data); return data; } },
    $transaction: async (callback: (tx: unknown) => unknown) => {
      liveStatus = PaperworkStatus.PENDING_REVIEW;
      return callback(prisma);
    },
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never) as any;

  await assert.rejects(
    () => service.updatePaperwork({
      visitId: 'visit-1', adminUserId: 'admin-1', kind: PaperworkKind.SERVICE_SLIP, status: PaperworkStatus.PRESENT,
    }),
    /durumu değişmiş/i,
  );
  assert.equal(liveStatus, PaperworkStatus.PENDING_REVIEW);
  assert.equal(history.length, 0);
});

test('duplicate taps and a later admin decision cannot overwrite service-slip state or create duplicate handoff audit', async () => {
  let serviceSlipStatus: PaperworkStatus = PaperworkStatus.MISSING;
  let staleReadStatus: PaperworkStatus = PaperworkStatus.MISSING;
  const compareAndSwap: any[] = [];
  const history: any[] = [];
  const prisma: any = {
    user: { findFirst: async () => ({ id: 'tech-1', name: 'Teknisyen' }) },
    maintenanceVisit: {
      updateMany: async ({ where, data }: any) => {
        compareAndSwap.push({ where, data });
        if (serviceSlipStatus !== PaperworkStatus.MISSING) return { count: 0 };
        serviceSlipStatus = data.serviceSlipStatus;
        return { count: 1 };
      },
      findUnique: async () => ({ id: 'visit-1', technicianId: 'tech-1', status: VisitStatus.VALID, serviceSlipStatus: staleReadStatus }),
    },
    paperworkStatusHistory: { create: async ({ data }: any) => { history.push(data); return data; } },
    $transaction: async (callback: (tx: unknown) => unknown) => callback(prisma),
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never) as any;

  const duplicateTaps = await Promise.allSettled([
    service.completeMissingServiceSlip({ visitId: 'visit-1', technicianId: 'tech-1' }),
    service.completeMissingServiceSlip({ visitId: 'visit-1', technicianId: 'tech-1' }),
  ]);
  assert.equal(duplicateTaps.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(duplicateTaps.filter((result) => result.status === 'rejected').length, 1);
  serviceSlipStatus = PaperworkStatus.PRESENT;
  staleReadStatus = PaperworkStatus.MISSING;
  await assert.rejects(
    () => service.completeMissingServiceSlip({ visitId: 'visit-1', technicianId: 'tech-1' }),
    /değişmiş|eksik/i,
  );

  assert.deepEqual(compareAndSwap[0], {
    where: { id: 'visit-1', technicianId: 'tech-1', status: VisitStatus.VALID, serviceSlipStatus: PaperworkStatus.MISSING },
    data: { serviceSlipStatus: PaperworkStatus.PENDING_REVIEW },
  });
  assert.equal(history.length, 1);
  assert.equal(serviceSlipStatus, PaperworkStatus.PRESENT);
});
