import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MaintenanceEngineService } from './maintenance-engine.service';

test('standard obligations never start before operations start date', async () => {
  const upserts: any[] = [];
  const prisma: any = {
    point: { findMany: async () => [{ id: 'p1', maintenanceWeek: 2, createdAt: new Date('2026-09-01T00:00:00.000Z') }] },
    maintenanceObligation: { upsert: async (args: any) => { upserts.push(args); } },
  };
  const config: any = { get: (key: string) => ({
    STANDARD_WEEK1_ANCHOR: '2026-09-14',
    STANDARD_OPERATIONS_START_DATE: '2026-09-14',
  } as Record<string, string>)[key] };
  const assignments: any = {};
  const service = new MaintenanceEngineService(prisma, config, assignments);

  await service.ensureStandardObligations(new Date('2026-09-27T12:00:00.000Z'));

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].create.cycleKey, 'STD:2026-09-21');
  assert.equal(upserts[0].create.dueStart.toISOString().slice(0, 10), '2026-09-21');
  assert.equal(upserts[0].create.dueEnd.toISOString().slice(0, 10), '2026-09-27');
});

test('week 1 can begin exactly on operations start date', async () => {
  const upserts: any[] = [];
  const prisma: any = {
    point: { findMany: async () => [{ id: 'p1', maintenanceWeek: 1, createdAt: new Date('2026-09-01T00:00:00.000Z') }] },
    maintenanceObligation: { upsert: async (args: any) => { upserts.push(args); } },
  };
  const config: any = { get: (key: string) => ({
    STANDARD_WEEK1_ANCHOR: '2026-09-14',
    STANDARD_OPERATIONS_START_DATE: '2026-09-14',
  } as Record<string, string>)[key] };
  const service = new MaintenanceEngineService(prisma, config, {} as any);

  await service.ensureStandardObligations(new Date('2026-09-20T12:00:00.000Z'));

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].create.cycleKey, 'STD:2026-09-14');
});


test('historical due snapshot constrains resolved obligations and SmartClean evidence to period end', async () => {
  const calls: any[] = [];
  const standardPoint = {
    id: 'p-standard', code: 'S1', name: 'Standard', regionId: 'r1', address: null,
    canonicalLatitude: null, canonicalLongitude: null, maintenanceType: 'STANDARD', maintenanceWeek: 1,
    coolerCount: 0, towerCount: 0, tapCount: 0, smarttapCount: 0,
    region: { id: 'r1', name: 'R1' },
  };
  const smartPoint = {
    id: 'p-smart', code: 'SC1', name: 'Smart', regionId: 'r1', address: null,
    canonicalLatitude: null, canonicalLongitude: null, maintenanceType: 'SMARTCLEAN', maintenanceWeek: 1,
    smartcleanReferenceAt: new Date('2026-07-20T00:00:00.000Z'),
    coolerCount: 0, towerCount: 0, tapCount: 0, smarttapCount: 0,
    region: { id: 'r1', name: 'R1' },
    visits: [{ performedAt: new Date('2026-07-20T09:00:00.000Z') }],
    attempts: [],
  };
  const prisma: any = {
    maintenanceObligation: {
      findMany: async (args: any) => { calls.push(['obligations', args]); return [{
        id: 'o1', pointId: 'p-standard', dueStart: new Date('2026-09-14T00:00:00.000Z'),
        dueEnd: new Date('2026-09-20T00:00:00.000Z'), resolvedAt: new Date('2026-09-21T09:00:00.000Z'),
        status: 'COMPLETED', point: standardPoint,
      }]; },
      upsert: async () => undefined,
    },
    point: {
      findMany: async (args: any) => {
        calls.push(['points', args]);
        if (args?.select) return [];
        return [smartPoint];
      },
    },
  };
  const config: any = { get: (key: string) => ({
    STANDARD_WEEK1_ANCHOR: '2026-09-14',
    STANDARD_OPERATIONS_START_DATE: '2026-09-14',
  } as Record<string, string>)[key] };
  const assignments: any = { resolveMany: async (ids: string[]) => new Map(ids.map((id) => [id, { technicianId: 't1', source: 'REGION', assignmentId: null }])) };
  const service = new MaintenanceEngineService(prisma, config, assignments);

  const result = await (service as any).dueSnapshot('2026-09-20');
  assert.equal(result.items.some((item: any) => item.pointId === 'p-standard'), true);
  const obligationQuery = calls.find(([kind]) => kind === 'obligations')[1];
  assert.equal(JSON.stringify(obligationQuery.where).includes('resolvedAt'), true);
  const smartQuery = calls.filter(([kind, args]) => kind === 'points' && !args?.select)[0][1];
  assert.equal(smartQuery.include.visits.where.performedAt.lt.toISOString(), '2026-09-20T21:00:00.000Z');
  assert.equal(smartQuery.include.attempts.where.reviewedAt.lt.toISOString(), '2026-09-20T21:00:00.000Z');
});

test('read-only snapshot reconstructs missing cycles without writes and does not reopen resolved cycles', async () => {
  let writes = 0;
  const point = {
    id: 'p1', code: 'P1', name: 'Point', regionId: 'r1', address: null,
    canonicalLatitude: null, canonicalLongitude: null, maintenanceType: 'STANDARD',
    maintenanceWeek: 1, createdAt: new Date('2026-09-01T00:00:00Z'),
    coolerCount: 0, towerCount: 0, tapCount: 0, smarttapCount: 0, region: { id: 'r1', name: 'Region' },
  };
  let resolved = false;
  const prisma: any = {
    point: { findMany: async (q: any) => q.where.maintenanceType === 'STANDARD' ? [point] : [] },
    maintenanceObligation: {
      upsert: async () => { writes++; },
      findMany: async (q: any) => q.select?.cycleKey && resolved
        ? [{ pointId: 'p1', cycleKey: 'STD:2026-09-14' }] : [],
    },
  };
  const config: any = { get: (key: string) => ({
    STANDARD_WEEK1_ANCHOR: '2026-09-14', STANDARD_OPERATIONS_START_DATE: '2026-09-14',
  } as Record<string, string>)[key] };
  const assignments: any = { resolveMany: async () => new Map([['p1', { technicianId: 't1', source: 'REGION' }]]) };
  const engine = new MaintenanceEngineService(prisma, config, assignments);
  const r = await (engine as any).dueSnapshot('2026-09-17', { readOnly: true });
  assert.equal(writes, 0, 'a report must never upsert obligations');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].priority, 'CURRENT');
  assert.equal(r.items[0].technicianId, 't1');
  resolved = true;
  const closed = await (engine as any).dueSnapshot('2026-09-17', { readOnly: true });
  assert.equal(closed.items.length, 0, 'persisted resolved cycle must not be synthesized');
  assert.equal(writes, 0);
});

test('read-only snapshot includes a standard point created during the selected Istanbul day', async () => {
  const point = {
    id: 'p-day', code: 'PD', name: 'Created today', regionId: 'r1', address: null,
    canonicalLatitude: null, canonicalLongitude: null, maintenanceType: 'STANDARD',
    maintenanceWeek: 1, createdAt: new Date('2026-09-17T10:00:00Z'),
    coolerCount: 0, towerCount: 0, tapCount: 0, smarttapCount: 0, region: { id: 'r1', name: 'Region' },
  };
  const prisma: any = {
    point: { findMany: async (q: any) => {
      if (q.where.maintenanceType !== 'STANDARD') return [];
      const created = q.where.createdAt;
      if (created?.lte && point.createdAt > created.lte) return [];
      if (created?.lt && point.createdAt >= created.lt) return [];
      return [point];
    } },
    maintenanceObligation: { findMany: async () => [] },
  };
  const config: any = { get: (key: string) => ({
    STANDARD_WEEK1_ANCHOR: '2026-09-14', STANDARD_OPERATIONS_START_DATE: '2026-09-14',
  } as Record<string, string>)[key] };
  const assignments: any = { resolveMany: async () => new Map([['p-day', { technicianId: 't1', source: 'REGION' }]]) };
  const engine = new MaintenanceEngineService(prisma, config, assignments);
  const result = await engine.dueSnapshot('2026-09-17', { readOnly: true });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].pointId, 'p-day');
});

test('read-only snapshot orders persisted and synthesized cycles before choosing the oldest', async () => {
  const point = {
    id: 'p-order', code: 'PO', name: 'Ordered', regionId: 'r1', address: null,
    canonicalLatitude: null, canonicalLongitude: null, maintenanceType: 'STANDARD',
    maintenanceWeek: 1, createdAt: new Date('2026-09-01T00:00:00Z'),
    coolerCount: 0, towerCount: 0, tapCount: 0, smarttapCount: 0, region: { id: 'r1', name: 'Region' },
  };
  const newer = {
    id: 'o-new', pointId: point.id, cycleKey: 'STD:2026-09-28',
    dueStart: new Date('2026-09-28T00:00:00Z'), dueEnd: new Date('2026-10-04T00:00:00Z'),
    status: 'OPEN', resolvedAt: null, completedAt: null, resolvedByVisitId: null,
    resolvedByAttemptId: null, createdAt: new Date('2026-09-28T00:00:00Z'), point,
  };
  const prisma: any = {
    point: { findMany: async (q: any) => q.where.maintenanceType === 'STANDARD' ? [point] : [] },
    maintenanceObligation: { findMany: async (q: any) => q.select ? [{ pointId: point.id, cycleKey: newer.cycleKey }] : [newer] },
  };
  const config: any = { get: (key: string) => ({
    STANDARD_WEEK1_ANCHOR: '2026-09-14', STANDARD_OPERATIONS_START_DATE: '2026-09-14',
  } as Record<string, string>)[key] };
  const assignments: any = { resolveMany: async () => new Map([['p-order', { technicianId: 't1', source: 'REGION' }]]) };
  const engine = new MaintenanceEngineService(prisma, config, assignments);
  const result = await engine.dueSnapshot('2026-10-01', { readOnly: true });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].dueStart.toISOString().slice(0, 10), '2026-09-14');
  assert.equal(result.items[0].obligationId, 'snapshot:p-order:STD:2026-09-14');
});
