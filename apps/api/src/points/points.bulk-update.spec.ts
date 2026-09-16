import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MaintenanceType, PointStatus } from '@prisma/client';
import { PointsService } from './points.service';

type Row = { id: string; code: string; name: string; regionId: string | null; status: PointStatus; maintenanceType: MaintenanceType; maintenanceWeek: number | null; smartcleanReferenceAt: Date | null; deletedAt: null };

function point(id: string): Row {
  return { id, code: `C-${id}`, name: `Point ${id}`, regionId: 'r1', status: PointStatus.ACTIVE, maintenanceType: MaintenanceType.STANDARD, maintenanceWeek: 1, smartcleanReferenceAt: null, deletedAt: null };
}

function harness(rows: Row[], options: { admin?: boolean; failUpdateId?: string; regionExists?: boolean } = {}) {
  const state = new Map(rows.map((row) => [row.id, { ...row }]));
  const audits: any[] = [];
  let transactionCalls = 0;
  const prisma: any = {
    user: { findFirst: async () => options.admin === false ? null : ({ id: 'admin-1', name: 'Admin' }) },
    point: { update: async () => { throw new Error('mutation must stay inside transaction'); } },
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      transactionCalls += 1;
      const staged = new Map([...state].map(([id, row]) => [id, { ...row }]));
      const stagedAudits: any[] = [];
      const tx = {
        point: {
          findMany: async ({ where }: any) => [...staged.values()].filter((row) => where.id.in.includes(row.id) && row.deletedAt === null),
          update: async ({ where, data }: any) => {
            if (where.id === options.failUpdateId) throw new Error('simulated update failure');
            const current = staged.get(where.id)!;
            const next = { ...current, ...data };
            staged.set(where.id, next);
            return next;
          },
          updateMany: async ({ where, data }: any) => {
            if (options.failUpdateId && where.id.in.includes(options.failUpdateId)) throw new Error('simulated update failure');
            let count = 0;
            for (const id of where.id.in) {
              const current = staged.get(id);
              if (!current || current.deletedAt !== null) continue;
              staged.set(id, { ...current, ...data });
              count += 1;
            }
            return { count };
          },
        },
        region: { findUnique: async () => options.regionExists === false ? null : ({ id: 'r2' }) },
        adminAuditLog: {
          create: async ({ data }: any) => { stagedAudits.push(data); return data; },
          createMany: async ({ data }: any) => { stagedAudits.push(...data); return { count: data.length }; },
        },
      };
      try {
        const result = await callback(tx);
        state.clear();
        for (const [id, row] of staged) state.set(id, row);
        audits.push(...stagedAudits);
        return result;
      } catch (error) {
        throw error;
      }
    },
  };
  return { service: new PointsService(prisma, {} as never) as any, state, audits, transactionCalls: () => transactionCalls };
}

test('bulk status update changes every selected point and writes one audit per point', async () => {
  const h = harness([point('p1'), point('p2')]);
  const result = await h.service.bulkUpdate('admin-1', { pointIds: ['p1', 'p2'], action: 'SET_STATUS', status: PointStatus.PASSIVE });
  assert.equal(result.updated, 2);
  assert.equal(h.state.get('p1')?.status, PointStatus.PASSIVE);
  assert.equal(h.state.get('p2')?.status, PointStatus.PASSIVE);
  assert.equal(h.audits.length, 2);
  assert.ok(h.audits.every((entry) => entry.action === 'POINT_BULK_UPDATED'));
  assert.equal(h.transactionCalls(), 1);
});

test('bulk update rejects empty and over-500 selections before opening a transaction', async () => {
  const h = harness([point('p1')]);
  await assert.rejects(() => h.service.bulkUpdate('admin-1', { pointIds: [], action: 'SET_STATUS', status: PointStatus.ACTIVE }), /en az 1/i);
  await assert.rejects(() => h.service.bulkUpdate('admin-1', { pointIds: Array.from({ length: 501 }, (_, i) => `p${i}`), action: 'SET_STATUS', status: PointStatus.ACTIVE }), /500/i);
  assert.equal(h.transactionCalls(), 0);
});

test('bulk schedule validation rejects week zero and SmartClean without reference date', async () => {
  const h = harness([point('p1')]);
  await assert.rejects(() => h.service.bulkUpdate('admin-1', { pointIds: ['p1'], action: 'SET_STANDARD_WEEK', maintenanceWeek: 0 }), /1 veya 2/i);
  await assert.rejects(() => h.service.bulkUpdate('admin-1', { pointIds: ['p1'], action: 'SET_SMARTCLEAN', maintenanceWeek: 1 }), /referans tarihi/i);
  assert.equal(h.transactionCalls(), 0);
});

test('bulk SmartClean and Standard actions set complete schedule state', async () => {
  const h = harness([point('p1')]);
  await h.service.bulkUpdate('admin-1', { pointIds: ['p1'], action: 'SET_SMARTCLEAN', maintenanceWeek: 2, smartcleanReferenceAt: '2026-09-01' });
  assert.equal(h.state.get('p1')?.maintenanceType, MaintenanceType.SMARTCLEAN);
  assert.equal(h.state.get('p1')?.maintenanceWeek, 2);
  assert.equal(h.state.get('p1')?.smartcleanReferenceAt?.toISOString().slice(0, 10), '2026-09-01');
  await h.service.bulkUpdate('admin-1', { pointIds: ['p1'], action: 'SET_STANDARD_WEEK', maintenanceWeek: 1 });
  assert.equal(h.state.get('p1')?.maintenanceType, MaintenanceType.STANDARD);
  assert.equal(h.state.get('p1')?.maintenanceWeek, 1);
  assert.equal(h.state.get('p1')?.smartcleanReferenceAt, null);
});

test('bulk update is fail-closed for non-admins, unknown points, missing regions and transaction failures', async () => {
  const nonAdmin = harness([point('p1')], { admin: false });
  await assert.rejects(() => nonAdmin.service.bulkUpdate('tech-1', { pointIds: ['p1'], action: 'SET_STATUS', status: PointStatus.PASSIVE }), /admin/i);
  assert.equal(nonAdmin.transactionCalls(), 0);

  const missing = harness([point('p1')]);
  await assert.rejects(() => missing.service.bulkUpdate('admin-1', { pointIds: ['p1', 'missing'], action: 'SET_STATUS', status: PointStatus.PASSIVE }), /bulunamad/i);
  assert.equal(missing.state.get('p1')?.status, PointStatus.ACTIVE);
  assert.equal(missing.audits.length, 0);

  const noRegion = harness([point('p1')], { regionExists: false });
  await assert.rejects(() => noRegion.service.bulkUpdate('admin-1', { pointIds: ['p1'], action: 'SET_REGION', regionId: 'r2' }), /bölge/i);
  assert.equal(noRegion.state.get('p1')?.regionId, 'r1');

  const rollback = harness([point('p1'), point('p2')], { failUpdateId: 'p2' });
  await assert.rejects(() => rollback.service.bulkUpdate('admin-1', { pointIds: ['p1', 'p2'], action: 'SET_STATUS', status: PointStatus.PASSIVE }), /simulated update failure/);
  assert.equal(rollback.state.get('p1')?.status, PointStatus.ACTIVE);
  assert.equal(rollback.state.get('p2')?.status, PointStatus.ACTIVE);
  assert.equal(rollback.audits.length, 0);
});
