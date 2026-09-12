import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AssignedWeeklyWorkloadService } from './assigned-weekly-workload.service';

function sutFor(options: {
  standard: Array<{ pointId: string; dueEnd: Date }>;
  smartclean: Array<{ pointId: string; state: 'CURRENT' | 'CARRYOVER' }>;
  assignments: Record<string, string | null>;
}) {
  const prisma = {
    maintenanceObligation: { findMany: async () => options.standard },
  } as any;
  const assignments = {
    resolveMany: async (pointIds: string[]) => new Map(
      pointIds.map((pointId) => [
        pointId,
        options.assignments[pointId]
          ? { technicianId: options.assignments[pointId] }
          : undefined,
      ]),
    ),
  } as any;
  const effectiveWorkload = {
    smartcleanForWeek: async () => options.smartclean,
  } as any;
  return new AssignedWeeklyWorkloadService(prisma, assignments, effectiveWorkload);
}

test('splits current and carryover workload by effective technician assignment', async () => {
  const sut = sutFor({
    standard: [
      { pointId: 'p-current', dueEnd: new Date('2026-09-13T00:00:00Z') },
      { pointId: 'p-carry', dueEnd: new Date('2026-09-06T00:00:00Z') },
    ],
    smartclean: [
      { pointId: 'p-smart-current', state: 'CURRENT' },
      { pointId: 'p-smart-carry', state: 'CARRYOVER' },
    ],
    assignments: {
      'p-current': 't1',
      'p-carry': 't1',
      'p-smart-current': 't2',
      'p-smart-carry': 't2',
    },
  });

  const result = await sut.forWeek(new Date('2026-09-09T12:00:00Z'));
  assert.equal(result.weekKey, '2026-W37');
  assert.deepEqual(result.technicians, [
    { technicianId: 't1', standardCurrent: 1, standardCarryover: 1, smartcleanCurrent: 0, smartcleanCarryover: 0 },
    { technicianId: 't2', standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 1, smartcleanCarryover: 1 },
  ]);
});

test('counts workload without an effective assignment as unassigned', async () => {
  const sut = sutFor({
    standard: [{ pointId: 'p1', dueEnd: new Date('2026-09-13T00:00:00Z') }],
    smartclean: [{ pointId: 'p2', state: 'CARRYOVER' }],
    assignments: { p1: null, p2: null },
  });

  const result = await sut.forWeek(new Date('2026-09-09T12:00:00Z'));
  assert.deepEqual(result.technicians, []);
  assert.deepEqual(result.unassigned, {
    standardCurrent: 1,
    standardCarryover: 0,
    smartcleanCurrent: 0,
    smartcleanCarryover: 1,
  });
});
