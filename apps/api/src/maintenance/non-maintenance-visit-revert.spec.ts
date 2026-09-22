import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { NonMaintenanceVisitService } from './non-maintenance-visit.service';
import { MaintenanceController } from './maintenance.controller';

const TECHNICIAN_ID = '22222222-2222-4222-8222-222222222222';
const VISIT_ID = '11111111-1111-4111-8111-111111111111';

function serviceWith(prisma: any) {
  return new NonMaintenanceVisitService(prisma, {} as any);
}

test('a technician can revert their own non-maintenance visit entered yesterday and an audit remains', async () => {
  const visit = {
    id: VISIT_ID,
    technicianId: TECHNICIAN_ID,
    pointId: null,
    customerName: 'Örnek Müşteri',
    visitedAt: new Date('2026-09-19T20:30:00.000Z'),
    recordedAtServer: new Date('2026-09-19T20:59:59.000Z'),
    purpose: 'BREAKDOWN',
  };
  const deletes: any[] = [];
  const audits: any[] = [];
  const prisma: any = {
    nonMaintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: TECHNICIAN_ID, role: 'TECHNICIAN' }) },
    $transaction: async (operation: (tx: any) => Promise<unknown>) => operation({
      nonMaintenanceVisit: {
        delete: async (args: any) => {
          deletes.push(args);
          return visit;
        },
      },
      adminAuditLog: {
        create: async ({ data }: any) => {
          audits.push(data);
          return data;
        },
      },
    }),
  };
  const service: any = serviceWith(prisma);
  assert.equal(typeof service.revert, 'function');
  const result = await service.revert(
    { visitId: VISIT_ID, userId: TECHNICIAN_ID, reason: 'Yanlış ziyaret kaydı' },
    new Date('2026-09-20T20:59:59.000Z'),
  );

  assert.equal(result, visit);
  assert.deepEqual(deletes, [{ where: { id: VISIT_ID } }]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].entityType, 'NON_MAINTENANCE_VISIT');
  assert.equal(audits[0].entityId, VISIT_ID);
  assert.equal(audits[0].action, 'NON_MAINTENANCE_VISIT_REVERTED');
  assert.equal(audits[0].actorId, TECHNICIAN_ID);
  assert.equal(audits[0].note, 'Yanlış ziyaret kaydı');
});

test('technician-only endpoint supplies the authenticated user id to non-maintenance visit revert', async () => {
  const calls: any[] = [];
  const otherVisits: any = {
    revert: async (dto: any) => {
      calls.push(dto);
      return { id: dto.visitId };
    },
  };
  const controller: any = new MaintenanceController(
    {} as any, {} as any, {} as any, {} as any, otherVisits, {} as any,
  );
  assert.equal(typeof controller.revertNonMaintenanceVisit, 'function');
  const result = await controller.revertNonMaintenanceVisit(
    { id: TECHNICIAN_ID },
    { visitId: VISIT_ID, reason: 'Yanlış ziyaret kaydı' },
  );
  assert.deepEqual(result, { id: VISIT_ID });
  assert.deepEqual(calls, [{
    visitId: VISIT_ID,
    reason: 'Yanlış ziyaret kaydı',
    userId: TECHNICIAN_ID,
  }]);
});

test('history marks a non-maintenance visit entered yesterday as revert eligible', async () => {
  const visit = {
    id: VISIT_ID,
    technicianId: TECHNICIAN_ID,
    purpose: 'BREAKDOWN',
    customerName: 'Örnek Müşteri',
    visitedAt: new Date('2026-09-19T20:30:00.000Z'),
    recordedAtServer: new Date('2026-09-19T20:59:59.000Z'),
    point: null,
  };
  const prisma: any = {
    user: { findFirst: async () => ({ id: TECHNICIAN_ID, name: 'Ömer' }) },
    nonMaintenanceVisit: { findMany: async () => [visit] },
  };
  const result = await serviceWith(prisma).technicianHistory(TECHNICIAN_ID, '2026-09-20T20:59:59.000Z');
  assert.equal((result.items[0] as any).revertEligible, true);
});
