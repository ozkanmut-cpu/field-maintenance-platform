import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import 'reflect-metadata';
import { PaperworkStatus, UserRole, VisitStatus } from '@prisma/client';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

function makeService() {
  const calls: any[] = [];
  const prisma: any = {
    user: { findMany: async (args: any) => { calls.push(['users', args]); return [
      { id: 't1', name: 'Ali', username: 'ali' },
      { id: 't2', name: 'Zeynep', username: 'zeynep' },
    ]; } },
    maintenanceVisit: {
      findMany: async (args: any) => { calls.push(['visits', args]); return [
        { technicianId: 't1' }, { technicianId: 't1' }, { technicianId: 't2' },
      ]; },
      count: async (args: any) => {
        calls.push(['visitCount', args]);
        if (args.where.serviceSlipStatus?.in?.includes(PaperworkStatus.PENDING_REVIEW)) return 6;
        if (args.where.serviceSlipStatus === PaperworkStatus.PENDING) return 4;
        if (args.where.confirmationStatus === PaperworkStatus.PENDING) return 3;
        return 0;
      },
    },
    maintenanceAttempt: { findMany: async (args: any) => { calls.push(['attempts', args]); return [{ technicianId: 't1' }, { technicianId: 't2' }]; } },
    nonMaintenanceVisit: { findMany: async (args: any) => { calls.push(['otherVisits', args]); return [{ technicianId: 't2' }]; } },
  };
  const engine: any = { due: async (date: string) => {
    calls.push(['due', date]);
    return { items: [
      { technicianId: 't1', priority: 'OVERDUE' },
      { technicianId: 't1', priority: 'CURRENT' },
      { technicianId: 't2', priority: 'CURRENT' },
      { technicianId: null, priority: 'OVERDUE' },
    ] };
  } };
  const service = new MaintenanceService(prisma, {} as any, engine, {} as any, {} as any, {} as any, {} as any);
  return { service, calls };
}

test('daily admin summary uses Istanbul day bounds and combines field activity, open work and paperwork backlog', async () => {
  const { service, calls } = makeService();
  const result = await (service as any).adminDailySummary('2026-09-16', new Date('2026-09-16T18:00:00Z'));
  assert.equal(result.date, '2026-09-16');
  assert.deepEqual(result.metrics, {
    completedMaintenance: 3, fieldTechnicianCount: 2, attemptCount: 2, nonMaintenanceVisitCount: 1,
    currentOpen: 2, overdueOpen: 2, unassignedOpen: 1,
    paperworkPending: 9, serviceSlipPending: 6, confirmationPending: 3,
  });
  assert.deepEqual(result.technicians, [
    { technicianId: 't1', name: 'Ali', username: 'ali', completedMaintenance: 2, attempts: 1, nonMaintenanceVisits: 0, currentOpen: 1, overdueOpen: 1 },
    { technicianId: 't2', name: 'Zeynep', username: 'zeynep', completedMaintenance: 1, attempts: 1, nonMaintenanceVisits: 1, currentOpen: 1, overdueOpen: 0 },
  ]);
  const visitQuery = calls.find(([kind]) => kind === 'visits')[1];
  assert.equal(visitQuery.where.status, VisitStatus.VALID);
  assert.equal(visitQuery.where.performedAt.gte.toISOString(), '2026-09-15T21:00:00.000Z');
  assert.equal(visitQuery.where.performedAt.lt.toISOString(), '2026-09-16T21:00:00.000Z');
  assert.deepEqual(calls.find(([kind]) => kind === 'due'), ['due', '2026-09-16']);
  assert.deepEqual(calls.find(([kind, args]) => kind === 'visitCount' && args.where.serviceSlipStatus?.in)?.[1].where.serviceSlipStatus.in, [PaperworkStatus.PENDING, PaperworkStatus.PENDING_REVIEW]);
});

test('daily admin summary rejects invalid date input', async () => {
  const { service } = makeService();
  await assert.rejects(() => (service as any).adminDailySummary('2026-02-30'), /geçersiz tarih/i);
});

test('daily admin summary controller route is admin-only and forwards the date', async () => {
  const maintenance: any = { adminDailySummary: async (date?: string) => ({ date }) };
  const controller = new MaintenanceController(maintenance, {} as any, {} as any, {} as any, {} as any, {} as any);
  const handler = (controller as any).adminDailySummary;
  assert.equal(typeof handler, 'function');
  const { ROLES_KEY } = await import('../auth/auth.constants');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [UserRole.ADMIN]);
  assert.deepEqual(await handler.call(controller, '2026-09-16'), { date: '2026-09-16' });
});
