import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EffectiveWorkloadService } from './effective-workload.service';

function service(points: unknown[]) {
  const prisma = { point: { findMany: async () => points } } as any;
  const config = { get: () => '2026-08-31' } as any;
  return new EffectiveWorkloadService(prisma, config);
}

test('exposes SmartClean as current workload only in its aligned rut week', async () => {
  const sut = service([{ id: 'p1', regionId: 'r1', maintenanceWeek: 1, smartcleanReferenceAt: new Date('2026-07-01T00:00:00Z'), visits: [], attempts: [] }]);
  const before = await sut.smartcleanForWeek(new Date('2026-08-28T12:00:00Z'));
  const due = await sut.smartcleanForWeek(new Date('2026-09-02T12:00:00Z'));
  assert.equal(before.length, 0);
  assert.equal(due.length, 1);
  assert.equal(due[0].state, 'CURRENT');
  assert.equal(due[0].dueStart.toISOString().slice(0, 10), '2026-08-31');
});

test('keeps an uncompleted earlier SmartClean due as carryover', async () => {
  const sut = service([{ id: 'p1', regionId: 'r1', maintenanceWeek: 1, smartcleanReferenceAt: new Date('2026-07-01T00:00:00Z'), visits: [], attempts: [] }]);
  const rows = await sut.smartcleanForWeek(new Date('2026-09-16T12:00:00Z'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'CARRYOVER');
});

test('missing rut anchor brakes SmartClean AI workload without inventing schedule', async () => {
  const prisma = { point: { findMany: async () => { throw new Error('should not query'); } } } as any;
  const config = { get: () => undefined } as any;
  const sut = new EffectiveWorkloadService(prisma, config);
  assert.equal(sut.smartcleanScheduleConfigured(), false);
  assert.deepEqual(await sut.smartcleanForWeek(new Date('2026-09-02T12:00:00Z')), []);
});
