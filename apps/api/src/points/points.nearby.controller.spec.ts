import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/auth.constants';
import { PointsController } from './points.controller';

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
