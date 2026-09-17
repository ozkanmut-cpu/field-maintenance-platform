import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { PaperworkStatus, UserRole, VisitStatus } from '@prisma/client';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

function point(id: string, name: string) {
  return { id, code: id.toUpperCase(), name, maintenanceType: 'STANDARD' };
}

function makeService() {
  const calls: any[] = [];
  const t1 = { id: 't1', name: 'Ali', username: 'ali' };
  const t2 = { id: 't2', name: 'Zeynep', username: 'zeynep' };
  const visits = [
    { id: 'v1', technicianId: 't1', technician: t1, assistedForTechnicianId: null, assistedForTechnician: null, performedAt: new Date('2026-09-16T06:00:00Z'), enteredLate: false, serviceSlipStatus: PaperworkStatus.PENDING, confirmationStatus: PaperworkStatus.PRESENT, point: point('p1', 'Kendi Noktası') },
    { id: 'v2', technicianId: 't1', technician: t1, assistedForTechnicianId: 't2', assistedForTechnician: t2, performedAt: new Date('2026-09-16T07:00:00Z'), enteredLate: false, serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.PRESENT, point: point('p2', 'Yardım Verilen') },
    { id: 'v3', technicianId: 't2', technician: t2, assistedForTechnicianId: 't1', assistedForTechnician: t1, performedAt: new Date('2026-09-16T08:00:00Z'), enteredLate: false, serviceSlipStatus: PaperworkStatus.MISSING, confirmationStatus: PaperworkStatus.PENDING, point: point('p3', 'Yardım Alınan') },
  ];
  const attempts = [
    { id: 'a1', technicianId: 't1', technician: t1, assistedForTechnicianId: null, assistedForTechnician: null, attemptedAt: new Date('2026-09-16T09:00:00Z'), reason: 'OTHER', note: null, point: point('p4', 'Kendi Deneme') },
    { id: 'a2', technicianId: 't1', technician: t1, assistedForTechnicianId: 't2', assistedForTechnician: t2, attemptedAt: new Date('2026-09-16T10:00:00Z'), reason: 'ACCESS_FAILED', note: null, point: point('p5', 'Yardım Deneme') },
    { id: 'a3', technicianId: 't2', technician: t2, assistedForTechnicianId: 't1', assistedForTechnician: t1, attemptedAt: new Date('2026-09-16T11:00:00Z'), reason: 'BUSINESS_CLOSED', note: null, point: point('p6', 'Alınan Deneme') },
  ];  const prisma: any = {
    user: {
      findFirst: async (args: any) => {
        calls.push(['user', args]);
        return args.where.id === 't1' ? { id: 't1', name: 'Ali' } : null;
      },
    },
    maintenanceVisit: {
      findMany: async (args: any) => { calls.push(['visits', args]); return visits; },
    },
    maintenanceAttempt: {
      findMany: async (args: any) => { calls.push(['attempts', args]); return attempts; },
    },
    nonMaintenanceVisit: {
      findMany: async (args: any) => { calls.push(['otherVisits', args]); return [
        { id: 'n1', technicianId: 't1', visitedAt: new Date('2026-09-16T12:00:00Z'), purpose: 'SURVEY', note: null, point: point('p7', 'Diğer Ziyaret') },
      ]; },
    },
    prospectVisit: {
      findMany: async (args: any) => { calls.push(['prospects', args]); return [
        { id: 'r1', technicianId: 't1', visitedAt: new Date('2026-09-16T13:00:00Z'), purpose: 'SURVEY', note: null, prospect: { id: 'x1', name: 'Aday Müşteri', sapNo: null, status: 'CANDIDATE', convertedPointId: null } },
      ]; },
    },
  };
  const engine: any = {
    dueSnapshot: async (date: string) => {
      calls.push(['dueSnapshot', date]);
      return { items: [
        { technicianId: 't1', priority: 'OVERDUE', pointId: 'd1' },
        { technicianId: 't1', priority: 'CURRENT', pointId: 'd2' },
        { technicianId: 't2', priority: 'CURRENT', pointId: 'd3' },
      ] };
    },
  };  const service = new MaintenanceService(prisma, {} as any, engine, {} as any, {} as any, {} as any, {} as any);
  return { service, calls };
}

test('technician daily summary separates own work from help given and received and uses a historical due snapshot', async () => {
  const { service, calls } = makeService();
  const result = await (service as any).adminTechnicianDailySummary('t1', '2026-09-16', new Date('2026-09-17T05:00:00Z'));
  assert.equal(result.date, '2026-09-16');
  assert.deepEqual(result.technician, { id: 't1', name: 'Ali' });
  assert.deepEqual(result.metrics, {
    completedMaintenance: 1,
    attemptCount: 1,
    nonMaintenanceVisitCount: 1,
    prospectVisitCount: 1,
    currentOpen: 1,
    overdueOpen: 1,
    helpedMaintenance: 1,
    helpedAttempts: 1,
    receivedHelpMaintenance: 1,
    receivedHelpAttempts: 1,
  });
  assert.deepEqual(result.paperwork, {
    serviceSlip: { pending: 1, present: 0, missing: 1 },
    confirmation: { pending: 1, present: 1, missing: 0 },
  });
  assert.equal(result.events.length, 8);
  assert.deepEqual(result.events.slice(0, 3).map((item: any) => item.relation), ['OWN', 'HELPED_OTHER', 'RECEIVED_HELP']);
  assert.deepEqual(calls.find(([kind]) => kind === 'dueSnapshot'), ['dueSnapshot', '2026-09-16']);
  const visitQuery = calls.find(([kind]) => kind === 'visits')[1];
  assert.equal(visitQuery.where.status, VisitStatus.VALID);
  assert.equal(visitQuery.where.performedAt.gte.toISOString(), '2026-09-15T21:00:00.000Z');
  assert.equal(visitQuery.where.performedAt.lt.toISOString(), '2026-09-16T21:00:00.000Z');
  assert.deepEqual(visitQuery.where.OR, [{ technicianId: 't1' }, { assistedForTechnicianId: 't1' }]);
});
test('technician daily summary rejects invalid date input', async () => {
  const { service } = makeService();
  await assert.rejects(
    () => (service as any).adminTechnicianDailySummary('t1', '2026-02-30'),
    /geçersiz tarih/i,
  );
});

test('technician daily summary requires a technician id', async () => {
  const { service } = makeService();
  await assert.rejects(
    () => (service as any).adminTechnicianDailySummary('', '2026-09-16'),
    /teknisyen/i,
  );
});

test('technician daily summary controller route is admin-only and forwards technician and date', async () => {
  const maintenance: any = {
    adminTechnicianDailySummary: async (technicianId?: string, date?: string) => ({ technicianId, date }),
  };
  const controller = new MaintenanceController(maintenance, {} as any, {} as any, {} as any, {} as any);
  const handler = (controller as any).adminTechnicianDailySummary;
  assert.equal(typeof handler, 'function');
  const { ROLES_KEY } = await import('../auth/auth.constants');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [UserRole.ADMIN]);
  assert.deepEqual(await handler.call(controller, 't1', '2026-09-16'), { technicianId: 't1', date: '2026-09-16' });
});
