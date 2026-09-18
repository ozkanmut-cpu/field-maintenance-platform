import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { PointsService } from './points.service';

test('my-customers exposes point aliases for technician search', async () => {
  let pointQuery: any;
  const point = {
    id: 'p1', code: 'C1', name: 'Yeni Ad', address: 'İskele Cd. 10', regionId: 'r1',
    canonicalLatitude: null, canonicalLongitude: null, locationSource: null, locationConfidence: 0,
    coolerCount: 1, towerCount: 1, tapCount: 1, smarttapCount: 0,
    equipmentVerifiedAt: null, equipmentVerifiedById: null,
    region: { id: 'r1', name: 'Urla' }, aliases: [{ alias: 'Eski Meyhane' }],
  };
  const prisma: any = {
    user: { findFirst: async () => ({ id: 't1' }) },
    point: { findMany: async (args: any) => { pointQuery = args; return [point]; } },
  };
  const assignments: any = {
    resolveMany: async () => new Map([['p1', { technicianId: 't1', source: 'REGION' }]]),
  };
  const service = new PointsService(prisma, assignments);

  const result = await service.myCustomers('t1');

  assert.deepEqual(pointQuery.select.aliases, { select: { alias: true } });
  assert.deepEqual((result[0] as any).aliases, ['Eski Meyhane']);
});
