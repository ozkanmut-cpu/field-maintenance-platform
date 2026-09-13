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
