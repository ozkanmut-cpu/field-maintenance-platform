import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PaperworkKind, PaperworkStatus, UserRole, VisitStatus } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

function history(kind: PaperworkKind, newStatus: PaperworkStatus, changedAt: string) {
  return { kind, newStatus, changedAt: new Date(changedAt) };
}

function visit(input: {
  id: string;
  recordedAtServer: string;
  performedAt?: string;
  serviceSlipStatus: PaperworkStatus;
  confirmationStatus: PaperworkStatus;
  paperworkHistory: ReturnType<typeof history>[];
  confirmationReconciliations?: Array<{
    id: string; previousStatus: PaperworkStatus; nextStatus: PaperworkStatus;
    approvalSource: string | null; importRunId: string; createdAt: Date;
  }>;
}) {
  return {
    id: input.id,
    technicianId: 'tech-1',
    performedAt: new Date(input.performedAt ?? input.recordedAtServer),
    recordedAtServer: new Date(input.recordedAtServer),
    serviceSlipStatus: input.serviceSlipStatus,
    confirmationStatus: input.confirmationStatus,
    paperworkHistory: input.paperworkHistory,
    confirmationReconciliations: input.confirmationReconciliations ?? [],
  };
}

function harness(rows: ReturnType<typeof visit>[]) {
  let lastWhere: any;
  const prisma: any = {
    maintenanceVisit: {
      findMany: async ({ where }: any) => {
        lastWhere = where;
        return rows;
      },
    },
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never) as any;
  return { service, lastWhere: () => lastWhere };
}

test('paperwork analytics separates document arrival from status resolution and uses server-recorded time', async () => {
  const h = harness([
    visit({
      id: 'v1', recordedAtServer: '2026-09-10T10:00:00.000Z', performedAt: '2026-09-01T08:00:00.000Z',
      serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.PRESENT,
      paperworkHistory: [
        history(PaperworkKind.SERVICE_SLIP, PaperworkStatus.MISSING, '2026-09-10T10:30:00.000Z'),
        history(PaperworkKind.CONFIRMATION, PaperworkStatus.PRESENT, '2026-09-10T11:00:00.000Z'),
        history(PaperworkKind.SERVICE_SLIP, PaperworkStatus.PRESENT, '2026-09-10T12:00:00.000Z'),
      ],
    }),
    visit({
      id: 'v2', recordedAtServer: '2026-09-10T12:00:00.000Z',
      serviceSlipStatus: PaperworkStatus.PENDING, confirmationStatus: PaperworkStatus.MISSING,
      paperworkHistory: [
        history(PaperworkKind.CONFIRMATION, PaperworkStatus.MISSING, '2026-09-10T13:30:00.000Z'),
      ],
    }),
    visit({
      id: 'v3', recordedAtServer: '2026-09-10T14:00:00.000Z', performedAt: '2026-09-02T09:00:00.000Z',
      serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.PRESENT,
      paperworkHistory: [
        history(PaperworkKind.SERVICE_SLIP, PaperworkStatus.PRESENT, '2026-09-10T14:10:00.000Z'),
        history(PaperworkKind.CONFIRMATION, PaperworkStatus.PRESENT, '2026-09-10T14:20:00.000Z'),
      ],
    }),
  ]);

  const result = await h.service.paperworkAnalytics(
    { from: '2026-09-10', to: '2026-09-12', technicianId: 'tech-1' },
    new Date('2026-09-12T14:00:00.000Z'),
  );

  assert.equal(result.totalVisits, 3);
  assert.deepEqual(result.serviceSlip.statusCounts, { pending: 1, present: 2, missing: 0, approved: 0 });
  assert.equal(result.serviceSlip.arrival.completedCount, 2);
  assert.equal(result.serviceSlip.arrival.medianMinutes, 65);
  assert.equal(result.serviceSlip.arrival.p90Minutes, 120);
  assert.equal(result.serviceSlip.resolution.resolvedCount, 2);
  assert.equal(result.serviceSlip.resolution.medianMinutes, 20);
  assert.equal(result.serviceSlip.resolution.p90Minutes, 30);
  assert.deepEqual(result.serviceSlip.pendingAgeBuckets, { under24h: 0, h24to48: 0, d2to7: 1, d7plus: 0 });

  assert.deepEqual(result.confirmation.statusCounts, { pending: 0, present: 2, missing: 1, approved: 0 });
  assert.equal(result.confirmation.arrival.medianMinutes, 40);
  assert.equal(result.confirmation.resolution.medianMinutes, 60);
  assert.equal(result.confirmation.resolution.p90Minutes, 90);

  const where = h.lastWhere();
  assert.equal(where.status, VisitStatus.VALID);
  assert.equal(where.technicianId, 'tech-1');
  assert.ok(where.recordedAtServer.gte instanceof Date);
  assert.ok(where.recordedAtServer.lt instanceof Date);
});

test('paperwork analytics ignores impossible pre-record transitions', async () => {
  const h = harness([visit({
    id: 'v1', recordedAtServer: '2026-09-10T10:00:00.000Z',
    serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.PENDING,
    paperworkHistory: [
      history(PaperworkKind.SERVICE_SLIP, PaperworkStatus.PRESENT, '2026-09-10T09:00:00.000Z'),
      history(PaperworkKind.SERVICE_SLIP, PaperworkStatus.PRESENT, '2026-09-10T10:15:00.000Z'),
    ],
  })]);
  const result = await h.service.paperworkAnalytics({ from: '2026-09-10', to: '2026-09-10' }, new Date('2026-09-10T12:00:00.000Z'));
  assert.equal(result.serviceSlip.arrival.medianMinutes, 15);
});

test('paperwork analytics counts APPROVED separately from MISSING', async () => {
  const h = harness([visit({
    id: 'approved', recordedAtServer: '2026-09-10T10:00:00.000Z',
    serviceSlipStatus: PaperworkStatus.PRESENT,
    confirmationStatus: 'APPROVED' as PaperworkStatus,
    paperworkHistory: [history(PaperworkKind.CONFIRMATION, 'APPROVED' as PaperworkStatus, '2026-09-10T11:00:00.000Z')],
  })]);

  const result = await h.service.paperworkAnalytics({ from: '2026-09-10', to: '2026-09-10' });

  assert.deepEqual(result.confirmation.statusCounts, { pending: 0, present: 0, missing: 0, approved: 1 });
  assert.equal(result.confirmation.arrival.completedCount, 1);
  assert.equal(result.confirmation.resolution.resolvedCount, 1);
});

test('paperwork analytics includes automatic SAP reconciliation timing', async () => {
  const h = harness([visit({
    id: 'sap-approved', recordedAtServer: '2026-09-10T10:00:00.000Z',
    serviceSlipStatus: PaperworkStatus.PENDING,
    confirmationStatus: PaperworkStatus.APPROVED,
    paperworkHistory: [],
    confirmationReconciliations: [{
      id: 'reconciliation-1',
      previousStatus: PaperworkStatus.PENDING,
      nextStatus: PaperworkStatus.APPROVED,
      approvalSource: 'AUTO_SAP',
      importRunId: 'import-1',
      createdAt: new Date('2026-09-10T11:30:00.000Z'),
    }],
  })]);

  const result = await h.service.paperworkAnalytics({ from: '2026-09-10', to: '2026-09-10' });

  assert.equal(result.confirmation.arrival.completedCount, 1);
  assert.equal(result.confirmation.arrival.medianMinutes, 90);
  assert.equal(result.confirmation.resolution.resolvedCount, 1);
  assert.equal(result.confirmation.resolution.medianMinutes, 90);
});

test('public paperwork history merges SAP reconciliation with explicit system provenance', async () => {
  const changedAt = new Date('2026-09-10T10:30:00.000Z');
  const createdAt = new Date('2026-09-10T11:00:00.000Z');
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => ({
      id: 'visit-1', status: VisitStatus.VALID, serviceSlipStatus: PaperworkStatus.PRESENT,
      confirmationStatus: PaperworkStatus.APPROVED, point: { id: 'point-1', code: 'P1', name: 'Nokta' },
    }) },
    paperworkStatusHistory: { findMany: async () => [{
      id: 'manual-1', kind: PaperworkKind.SERVICE_SLIP, previousStatus: PaperworkStatus.PENDING,
      newStatus: PaperworkStatus.PRESENT, changedAt, note: null, changedBy: { id: 'admin-1', name: 'Admin' },
    }] },
    sapConfirmationReconciliation: { findMany: async () => [{
      id: 'sap-1', importRunId: 'import-1', previousStatus: PaperworkStatus.PENDING,
      nextStatus: PaperworkStatus.APPROVED, approvalSource: 'AUTO_SAP', createdAt,
    }] },
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  const result: any = await service.paperworkHistory('visit-1');

  assert.equal(result.history.length, 2);
  assert.equal(result.history[0].provenance, 'MANUAL_USER');
  assert.equal(result.history[0].changedBy.name, 'Admin');
  assert.deepEqual(result.history[1], {
    id: 'sap-1',
    kind: PaperworkKind.CONFIRMATION,
    previousStatus: PaperworkStatus.PENDING,
    newStatus: PaperworkStatus.APPROVED,
    changedAt: createdAt,
    note: 'SAP otomatik teyit mutabakatı',
    changedBy: null,
    provenance: 'SAP_RECONCILIATION',
    importRunId: 'import-1',
    approvalSource: 'AUTO_SAP',
  });
});

test('paperwork analytics keeps a service-slip pending review unresolved rather than counting it as missing', async () => {
  const h = harness([visit({
    id: 'v-review', recordedAtServer: '2026-09-10T10:00:00.000Z',
    serviceSlipStatus: PaperworkStatus.PENDING_REVIEW, confirmationStatus: PaperworkStatus.PENDING,
    paperworkHistory: [history(PaperworkKind.SERVICE_SLIP, PaperworkStatus.PENDING_REVIEW, '2026-09-10T10:15:00.000Z')],
  })]);

  const result = await h.service.paperworkAnalytics({ from: '2026-09-10', to: '2026-09-10' }, new Date('2026-09-10T12:00:00.000Z'));

  assert.deepEqual(result.serviceSlip.statusCounts, { pending: 1, present: 0, missing: 0, approved: 0 });
  assert.equal(result.serviceSlip.resolution.resolvedCount, 0);
});

test('paperwork analytics rejects reversed date ranges and ranges over 180 days', async () => {
  const h = harness([]);
  await assert.rejects(() => h.service.paperworkAnalytics({ from: '2026-09-12', to: '2026-09-10' }), /tarih aralığı/i);
  await assert.rejects(() => h.service.paperworkAnalytics({ from: '2026-01-01', to: '2026-09-10' }), /180/i);
});

test('point paperwork history is read-only and scoped to one point', async () => {
  const h = harness([visit({
    id: 'visit-1', recordedAtServer: '2026-09-10T10:00:00.000Z',
    serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.PENDING,
    paperworkHistory: [history(PaperworkKind.SERVICE_SLIP, PaperworkStatus.PRESENT, '2026-09-10T10:15:00.000Z')],
  })]);

  const result = await h.service.pointPaperworkHistory('point-1');

  assert.equal(result.count, 1);
  assert.equal(result.items[0].id, 'visit-1');
  assert.deepEqual(h.lastWhere(), { pointId: 'point-1' });
});

test('paperwork analytics controller route is admin-only and forwards filters', async () => {
  const { MaintenanceController } = await import('./maintenance.controller');
  const { ROLES_KEY } = await import('../auth/auth.constants');
  const calls: any[] = [];
  const maintenance: any = { paperworkAnalytics: async (query: any) => { calls.push(query); return { totalVisits: 0 }; } };
  const controller: any = new MaintenanceController(maintenance, {} as never, {} as never, {} as never, {} as never, {} as never);
  const handler = controller.paperworkAnalytics;
  assert.ok(typeof handler === 'function');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [UserRole.ADMIN]);
  const result = await controller.paperworkAnalytics('2026-09-01', '2026-09-10', 'tech-1');
  assert.deepEqual(calls, [{ from: '2026-09-01', to: '2026-09-10', technicianId: 'tech-1' }]);
  assert.equal(result.totalVisits, 0);
});

test('point paperwork history controller route is admin-only and forwards point id', async () => {
  const { MaintenanceController } = await import('./maintenance.controller');
  const { ROLES_KEY } = await import('../auth/auth.constants');
  const calls: string[] = [];
  const maintenance: any = { pointPaperworkHistory: async (pointId: string) => { calls.push(pointId); return { count: 0, items: [] }; } };
  const controller: any = new MaintenanceController(maintenance, {} as never, {} as never, {} as never, {} as never, {} as never);
  const handler = controller.pointPaperworkHistory;
  assert.ok(typeof handler === 'function');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [UserRole.ADMIN]);
  assert.deepEqual(await controller.pointPaperworkHistory('point-1'), { count: 0, items: [] });
  assert.deepEqual(calls, ['point-1']);
});
