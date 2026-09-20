import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PointAssignmentKind } from '@prisma/client';
import { AssignmentsService } from './assignments.service';

test('a future point override keeps the current override effective until its own start time', async () => {
  const futureStart = '2026-10-01T09:00:00.000Z';
  const previous = {
    id: 'previous-override',
    technicianId: 'tech-current',
    startsAt: new Date('2026-09-01T09:00:00.000Z'),
    endsAt: null,
    reason: 'Current owner',
  };
  const previousUpdates: any[] = [];
  const audits: any[] = [];
  const prisma: any = {
    point: { findFirst: async () => ({ id: 'point-1', code: 'P-1', name: 'Point 1' }) },
    user: {
      findFirst: async ({ where }: any) => where.id === 'tech-next'
        ? ({ id: 'tech-next', name: 'Next technician' })
        : ({ id: 'admin-1', name: 'Admin' }),
    },
    pointAssignment: { findFirst: async () => null },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      pointAssignment: {
        findMany: async () => [previous],
        updateMany: async (input: any) => { previousUpdates.push(input); return { count: 1 }; },
        create: async ({ data }: any) => ({
          id: 'future-override', active: true, ...data,
          technician: { id: 'tech-next', name: 'Next technician', active: true },
          createdBy: { id: 'admin-1', name: 'Admin' },
        }),
      },
      adminAuditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
    }),
  };

  const service = new AssignmentsService(prisma);
  await service.create({
    pointId: 'point-1', technicianId: 'tech-next', adminUserId: 'admin-1',
    kind: PointAssignmentKind.POINT_OVERRIDE, startsAt: futureStart,
  });

  assert.equal(previousUpdates.length, 1);
  assert.equal(previousUpdates[0].data.active, undefined);
  assert.equal(previousUpdates[0].data.endsAt.toISOString(), futureStart);
  assert.equal(audits[0].action, 'AUTO_ENDED_BY_REPLACEMENT');
  assert.deepEqual(audits[0].newValue, { active: true, endsAt: futureStart });
});
