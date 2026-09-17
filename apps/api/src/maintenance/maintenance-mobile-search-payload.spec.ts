import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MaintenanceEngineService } from './maintenance-engine.service';

test('due payload exposes aliases for technician task search', async () => {
  const point = {
    id: 'p1', code: 'C1', name: 'Yeni Ad', regionId: 'r1', address: 'İskele Cd. 10',
    canonicalLatitude: null, canonicalLongitude: null, maintenanceType: 'STANDARD', maintenanceWeek: 1,
    coolerCount: 0, towerCount: 0, tapCount: 0, smarttapCount: 0,
    region: { id: 'r1', name: 'Urla' }, aliases: [{ alias: 'Eski Meyhane' }],
  };
  let obligationQuery: any;
  const prisma: any = {
    point: { findMany: async () => [] },
    maintenanceObligation: {
      upsert: async () => undefined,
      findMany: async (args: any) => {
        obligationQuery = args;
        return [{ id: 'o1', pointId: 'p1', dueStart: new Date('2026-09-14T00:00:00Z'), dueEnd: new Date('2026-09-20T00:00:00Z'), point }];
      },
    },
  };
  const config: any = { get: (key: string) => ({ STANDARD_WEEK1_ANCHOR: '2026-09-14', STANDARD_OPERATIONS_START_DATE: '2026-09-14' } as any)[key] };
  const assignments: any = { resolveMany: async () => new Map([['p1', { technicianId: 't1', source: 'REGION', assignmentId: null }]]) };
  const service = new MaintenanceEngineService(prisma, config, assignments);
  const result = await service.due('2026-09-17');
  assert.deepEqual(obligationQuery.include.point.include.aliases, { select: { alias: true } });
  assert.deepEqual((result.items[0] as any).aliases, ['Eski Meyhane']);
});
