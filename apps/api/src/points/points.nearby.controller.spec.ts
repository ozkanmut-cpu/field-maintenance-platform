import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/auth.constants';
import { PointsController } from './points.controller';
import { BulkPointAction } from './dto/bulk-update-points.dto';

test('nearby route forwards current technician and query values to the spatial service', async () => {
  const calls: unknown[][] = [];
  const spatial = {
    nearbyAssigned: async (...args: unknown[]) => {
      calls.push(args);
      return { count: 0, items: [] };
    },
  };
  const controller = new PointsController(
    {} as never,
    {} as never,
    spatial as never,
  );

  const result = await controller.nearby(
    { id: 'tech-1', role: UserRole.TECHNICIAN } as never,
    '38.4192',
    '27.1287',
    '5000',
    '25',
  );

  assert.deepEqual(calls, [[
    'tech-1',
    {
      latitude: '38.4192',
      longitude: '27.1287',
      radiusMeters: '5000',
      limit: '25',
    },
  ]]);
  assert.deepEqual(result, { count: 0, items: [] });

  const roles = Reflect.getMetadata(ROLES_KEY, PointsController.prototype.nearby);
  assert.deepEqual(roles, [UserRole.TECHNICIAN]);
});

test('region-only point changes do not queue Google address discovery', async () => {
  const enqueueCalls: string[] = [];
  const enqueueManyCalls: string[][] = [];
  const controller = new PointsController(
    { update: async () => ({ id: 'point-1' }), bulkUpdate: async () => ({ pointIds: ['point-1'] }) } as never,
    { enqueue: (id: string) => enqueueCalls.push(id), enqueueMany: (ids: string[]) => enqueueManyCalls.push(ids) } as never,
    {} as never,
  );

  await controller.update({ id: 'admin-1' } as never, 'point-1', { regionId: 'region-2' } as never);
  await controller.bulkUpdate({ id: 'admin-1' } as never, { action: BulkPointAction.SET_REGION, pointIds: ['point-1'], regionId: 'region-2' } as never);

  assert.deepEqual(enqueueCalls, []);
  assert.deepEqual(enqueueManyCalls, []);
});

test('name changes still queue Google address discovery', async () => {
  const enqueueCalls: string[] = [];
  const controller = new PointsController(
    { update: async () => ({ id: 'point-1' }) } as never,
    { enqueue: (id: string) => enqueueCalls.push(id) } as never,
    {} as never,
  );

  await controller.update({ id: 'admin-1' } as never, 'point-1', { name: 'Yeni Ad' } as never);
  assert.deepEqual(enqueueCalls, ['point-1']);
});
