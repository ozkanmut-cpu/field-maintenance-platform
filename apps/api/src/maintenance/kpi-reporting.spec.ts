import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { PaperworkStatus, UserRole, VisitStatus } from '@prisma/client';
import { MaintenanceController } from './maintenance.controller';
import { ROLES_KEY } from '../auth/auth.constants';

// Missing service must fail before any production implementation exists.
const loadService = () => require('./kpi-reporting.service').KpiReportingService;
const now = new Date('2026-09-17T05:00:00Z');
function fixture(empty = false) {
  const calls: any[] = [];
  const users = [{ id: 't1', name: 'Ali', username: 'ali' }, { id: 't2', name: 'Zeynep', username: 'zeynep' }];
  const visit = (id: string, technicianId: string, helped: string | null, at: string, status: VisitStatus = VisitStatus.VALID) => ({
    id, technicianId, assistedForTechnicianId: helped, performedAt: new Date(at), status,
    enteredLate: id === 'v2', serviceSlipStatus: id === 'v1' ? PaperworkStatus.PENDING : PaperworkStatus.PRESENT,
    confirmationStatus: id === 'v3' ? PaperworkStatus.MISSING : PaperworkStatus.PRESENT,
  });
  const visits = empty ? [] : [
    visit('v1', 't1', null, '2026-09-14T21:00:00Z'),
    visit('v2', 't1', 't2', '2026-09-15T20:59:59Z'),
    visit('v3', 't2', 't1', '2026-09-16T08:00:00Z'),
    visit('reversed', 't1', null, '2026-09-15T08:00:00Z', VisitStatus.REVERSED),
    visit('outside', 't1', null, '2026-09-16T21:00:00Z'),
  ];
  const attempts = empty ? [] : [
    { id: 'a1', technicianId: 't1', assistedForTechnicianId: null, attemptedAt: new Date('2026-09-15T09:00:00Z') },
    { id: 'a2', technicianId: 't1', assistedForTechnicianId: 't2', attemptedAt: new Date('2026-09-16T09:00:00Z') },
    { id: 'a3', technicianId: 't2', assistedForTechnicianId: 't1', attemptedAt: new Date('2026-09-16T10:00:00Z') },
  ];
  function rows(kind: string, values: any[], dateField: string) {
    return { findMany: async (args: any) => {
      calls.push([kind, args]);
      const w = args.where;
      assert.ok(w[dateField]?.gte instanceof Date);
      assert.ok(w[dateField]?.lt instanceof Date);
      if (kind === 'visits') assert.equal(w.status, VisitStatus.VALID);
      return values.filter(v => (!w.status || v.status === w.status)
        && v[dateField] >= w[dateField].gte && v[dateField] < w[dateField].lt
        && (!w.technicianId || v.technicianId === w.technicianId)
        && (!w.OR || w.OR.some((part: any) => Object.entries(part).every(([k, val]) => v[k] === val))));
    }};
  }
  const prisma: any = {
    user: { findMany: async () => users, findFirst: async (q: any) => users.find(u => u.id === q.where.id) ?? null },
    maintenanceVisit: rows('visits', visits, 'performedAt'),
    maintenanceAttempt: rows('attempts', attempts, 'attemptedAt'),
    nonMaintenanceVisit: rows('other', empty ? [] : [{ technicianId: 't1', visitedAt: new Date('2026-09-15T09:00:00Z') }], 'visitedAt'),
    prospectVisit: rows('prospect', empty ? [] : [{ technicianId: 't2', visitedAt: new Date('2026-09-16T09:00:00Z') }], 'visitedAt'),
  };
  const engine: any = { dueSnapshot: async (...args: any[]) => {
    calls.push(['snapshot', ...args]);
    return { items: empty ? [] : [
      { technicianId: 't1', priority: 'CURRENT' }, { technicianId: 't2', priority: 'OVERDUE' },
      { technicianId: null, priority: 'OVERDUE' },
    ] };
  }};
  return { service: new (loadService())(prisma, engine), calls };
}

test('KPI counts valid actor activity once and includes zero days and unassigned work', async () => {
  const { service, calls } = fixture();
  const r = await service.report({ from: '2026-09-14', to: '2026-09-16' }, now);
  assert.equal(r.metrics.completedMaintenance, 3);
  assert.equal(r.metrics.ownMaintenance, 1);
  assert.equal(r.metrics.attemptCount, 3);
  assert.equal(r.metrics.successRate, 50);
  assert.equal(r.metrics.enteredLate, 1);
  assert.equal(r.metrics.nonMaintenanceVisitCount, 1);
  assert.equal(r.metrics.prospectVisitCount, 1);
  assert.equal(r.metrics.helpedMaintenance, 2);
  assert.equal(r.metrics.receivedHelpMaintenance, 2);
  assert.equal(r.metrics.currentOpen, 1);
  assert.equal(r.metrics.overdueOpen, 2);
  assert.equal(r.metrics.unassignedOpen, 1);
  assert.deepEqual(r.daily.map((d: any) => [d.date, d.completedMaintenance]), [['2026-09-14', 0], ['2026-09-15', 2], ['2026-09-16', 1]]);
  assert.deepEqual(r.paperwork.serviceSlip, { pending: 1, present: 2, missing: 0 });
  assert.deepEqual(r.paperwork.confirmation, { pending: 0, present: 2, missing: 1 });
  assert.equal(r.technicians.reduce((n: number, t: any) => n + t.completedMaintenance, 0), 3);
  assert.deepEqual(calls.find(c => c[0] === 'snapshot'), ['snapshot', '2026-09-16', { readOnly: true }]);
});

test('technician filter separates performed work, help given and help received', async () => {
  const { service, calls } = fixture();
  const r = await service.report({ from: '2026-09-15', to: '2026-09-16', technicianId: 't1' }, now);
  assert.equal(r.metrics.completedMaintenance, 2);
  assert.equal(r.metrics.ownMaintenance, 1);
  assert.equal(r.metrics.helpedMaintenance, 1);
  assert.equal(r.metrics.receivedHelpMaintenance, 1);
  assert.equal(r.metrics.helpedAttempts, 1);
  assert.equal(r.metrics.receivedHelpAttempts, 1);
  assert.equal(r.metrics.attemptCount, 2);
  assert.equal(r.metrics.prospectVisitCount, 0);
  assert.equal(r.metrics.overdueOpen, 0);
  assert.equal(r.metrics.unassignedOpen, 0);
  assert.equal(r.technicians.length, 1);
  assert.equal(r.technicians[0].technicianId, 't1');
  assert.deepEqual(r.paperwork.serviceSlip, { pending: 1, present: 1, missing: 0 });
  const q = calls.find(c => c[0] === 'visits')[1].where;
  assert.equal(q.performedAt.gte.toISOString(), '2026-09-14T21:00:00.000Z');
  assert.equal(q.performedAt.lt.toISOString(), '2026-09-16T21:00:00.000Z');
  assert.deepEqual(q.OR, [{ technicianId: 't1' }, { assistedForTechnicianId: 't1' }]);
});

test('empty KPI defaults to 30 Istanbul dates and does not invent a success rate', async () => {
  const { service } = fixture(true);
  const r = await service.report({}, new Date('2026-09-16T21:30:00Z'));
  assert.equal(r.from, '2026-08-19');
  assert.equal(r.to, '2026-09-17');
  assert.equal(r.daily.length, 30);
  assert.equal(r.metrics.completedMaintenance, 0);
  assert.equal(r.metrics.successRate, null);
});

test('KPI validates dates and technician before querying activity', async () => {
  for (const query of [
    { from: '2026-02-30', to: '2026-09-16' },
    { from: '2026-09-17', to: '2026-09-16' },
    { to: '2026-09-18' },
    { from: '2026-03-21', to: '2026-09-17' },
    { from: '', to: '2026-09-17' },
    { technicianId: 'unknown' },
  ]) {
    const { service, calls } = fixture();
    await assert.rejects(() => service.report(query, now));
    assert.equal(calls.length, 0);
  }
  const { service } = fixture(true);
  const r = await service.report({ from: '2026-03-22', to: '2026-09-17' }, now);
  assert.equal(r.daily.length, 180);
});

test('KPI endpoint is admin-only and returns the reporting service contract', async () => {
  const { service } = fixture(true);
  const controller = new (MaintenanceController as any)({}, {}, {}, {}, {}, service);
  const handler = (controller as any).adminKpiReporting;
  assert.equal(typeof handler, 'function');
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [UserRole.ADMIN]);
  const result = await handler.call(controller, '2026-09-15', '2026-09-16', undefined);
  assert.equal(result.daily.length, 2);
});

test('technician breakdown includes a technician whose only activity is receiving help', async () => {
  const users = [
    { id: 'helper', name: 'Helper', username: 'helper' },
    { id: 'receiver', name: 'Receiver', username: 'receiver' },
  ];
  const prisma: any = {
    user: { findMany: async () => users },
    maintenanceVisit: { findMany: async () => [{
      id: 'v-help', technicianId: 'helper', assistedForTechnicianId: 'receiver',
      performedAt: new Date('2026-09-16T08:00:00Z'), enteredLate: false,
      serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.PRESENT,
    }] },
    maintenanceAttempt: { findMany: async () => [] },
    nonMaintenanceVisit: { findMany: async () => [] },
    prospectVisit: { findMany: async () => [] },
  };
  const engine: any = { dueSnapshot: async () => ({ items: [] }) };
  const service = new (loadService())(prisma, engine);
  const result = await service.report({ from: '2026-09-16', to: '2026-09-16' }, now);
  const receiver = result.technicians.find((row: any) => row.technicianId === 'receiver');
  assert.ok(receiver);
  assert.equal(receiver.completedMaintenance, 0);
  assert.equal(receiver.receivedHelpMaintenance, 1);
});
