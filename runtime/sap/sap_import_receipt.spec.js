const assert = require('node:assert/strict');
const { test } = require('node:test');
const { applyRows } = require('./sap_db_writer');

const WINDOW_START = new Date('2026-09-06T00:00:00.000Z');
const WINDOW_END = new Date('2026-09-20T00:00:00.000Z');
const ACQUIRED_AT = new Date('2026-09-20T11:55:00.000Z');
const COMPLETED_AT = new Date('2026-09-20T12:00:00.000Z');

function row(id = 'confirmation-1', overrides = {}) {
  return {
    confirmationId: id,
    pointCode: 'P1',
    recordDate: new Date('2026-09-19T00:00:00.000Z'),
    productId: '203',
    status: '*Onay Bekliyor',
    ...overrides,
  };
}

function options(importRunId, overrides = {}) {
  return {
    importRunId,
    acquiredAt: ACQUIRED_AT,
    completedAt: COMPLETED_AT,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

function matchesDate(value, filter = {}) {
  const time = new Date(value).getTime();
  return (filter.gte === undefined || time >= new Date(filter.gte).getTime())
    && (filter.lte === undefined || time <= new Date(filter.lte).getTime());
}

function atomicPrisma({ failCreate = false, confirmations = [] } = {}) {
  const committed = {
    receipts: [],
    confirmations: new Map(confirmations.map((item) => [item.confirmationId, clone(item)])),
    evidence: [],
    events: [],
  };
  let transactionTail = Promise.resolve();

  const findConfirmations = async ({ where = {} }) => [...committed.confirmations.values()]
    .filter((item) => !where.confirmationId?.in || where.confirmationId.in.includes(item.confirmationId))
    .filter((item) => where.productId === undefined || item.productId === where.productId)
    .filter((item) => !where.recordDate || matchesDate(item.recordDate, where.recordDate))
    .map(clone);

  const prisma = {
    sapConfirmation: { findMany: findConfirmations },
    $transaction: async (work) => {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = clone({
        receipts: committed.receipts,
        confirmations: [...committed.confirmations.entries()],
        evidence: committed.evidence,
        events: committed.events,
      });
      const tx = {
        sapConfirmation: {
          create: async ({ data }) => {
            if (failCreate) throw new Error('db-write-failed');
            if (committed.confirmations.has(data.confirmationId)) throw new Error('unique-confirmation-id');
            committed.events.push('confirmation');
            committed.confirmations.set(data.confirmationId, clone(data));
            return data;
          },
          update: async ({ where, data }) => {
            if (!committed.confirmations.has(where.confirmationId)) throw new Error('missing-confirmation-id');
            const next = { ...committed.confirmations.get(where.confirmationId), ...clone(data) };
            committed.confirmations.set(where.confirmationId, next);
            return next;
          },
          upsert: async ({ where, create, update }) => {
            if (failCreate) throw new Error('db-write-failed');
            const current = committed.confirmations.get(where.confirmationId);
            const next = current ? { ...current, ...clone(update) } : clone(create);
            committed.events.push(current ? 'confirmation-update' : 'confirmation');
            committed.confirmations.set(where.confirmationId, next);
            return next;
          },
          deleteMany: async ({ where }) => {
            let count = 0;
            for (const [id, item] of committed.confirmations) {
              if (where.productId !== undefined && item.productId !== where.productId) continue;
              if (where.recordDate && !matchesDate(item.recordDate, where.recordDate)) continue;
              if (where.confirmationId?.notIn?.includes(id)) continue;
              committed.confirmations.delete(id);
              count += 1;
            }
            return { count };
          },
        },
        sapConfirmationImportEvidence: {
          createMany: async ({ data }) => {
            committed.events.push('evidence');
            committed.evidence.push(...clone(data));
            return { count: data.length };
          },
        },
        sapImportRun: {
          create: async ({ data }) => {
            if (committed.receipts.some((item) => item.id === data.id)) throw new Error('unique-import-run-id');
            committed.events.push('receipt');
            committed.receipts.push(clone(data));
            return data;
          },
        },
      };
      try {
        return await work(tx);
      } catch (error) {
        committed.receipts = snapshot.receipts;
        committed.confirmations = new Map(snapshot.confirmations);
        committed.evidence = snapshot.evidence;
        committed.events = snapshot.events;
        throw error;
      } finally {
        release();
      }
    },
  };
  return { prisma, committed };
}

test('real SAP write atomically stores acquisition receipt, immutable evidence, and live cache', async () => {
  const h = atomicPrisma();
  const runId = '11111111-1111-4111-8111-111111111111';

  const result = await applyRows(h.prisma, [row()], options(runId));

  assert.equal(result.importRunId, runId);
  assert.equal(h.committed.receipts.length, 1);
  assert.equal(h.committed.receipts[0].acquiredAt.toISOString(), ACQUIRED_AT.toISOString());
  assert.equal(h.committed.receipts[0].completedAt.toISOString(), COMPLETED_AT.toISOString());
  assert.equal(h.committed.receipts[0].rowCount, 1);
  assert.equal(h.committed.evidence.length, 1);
  assert.equal(h.committed.evidence[0].importRunId, runId);
  assert.equal(h.committed.confirmations.get('confirmation-1').lastSeenImportId, runId);
  assert.equal(h.committed.events[0], 'receipt', 'foreign-key parent receipt must exist first');
  assert.equal(h.committed.events[1], 'evidence');
});

test('a failed SAP row write rolls back receipt and immutable evidence', async () => {
  const h = atomicPrisma({ failCreate: true });

  await assert.rejects(
    () => applyRows(h.prisma, [row()], options('11111111-1111-4111-8111-111111111111')),
    /db-write-failed/,
  );

  assert.equal(h.committed.receipts.length, 0);
  assert.equal(h.committed.evidence.length, 0);
  assert.equal(h.committed.confirmations.size, 0);
});

test('a newer import can retag live cache without corrupting older receipt evidence', async () => {
  const h = atomicPrisma();
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';

  await applyRows(h.prisma, [row('same', { status: '*Onay Bekliyor' })], options(first));
  await applyRows(h.prisma, [row('same', { status: 'Tamamlandı' })], options(second, {
    acquiredAt: new Date('2026-09-20T12:55:00.000Z'),
    completedAt: new Date('2026-09-20T13:00:00.000Z'),
  }));

  assert.deepEqual(
    h.committed.evidence.map(({ importRunId, status }) => ({ importRunId, status })),
    [
      { importRunId: first, status: '*Onay Bekliyor' },
      { importRunId: second, status: 'Tamamlandı' },
    ],
  );
  assert.equal(h.committed.confirmations.get('same').lastSeenImportId, second);
  assert.equal(h.committed.confirmations.get('same').status, 'Tamamlandı');
});

test('a newer import can delete a live row without deleting older receipt evidence', async () => {
  const h = atomicPrisma();
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';

  await applyRows(h.prisma, [row('removed')], options(first));
  await applyRows(h.prisma, [row('replacement')], options(second));

  assert.equal(h.committed.confirmations.has('removed'), false);
  assert.equal(h.committed.evidence.some((item) => (
    item.importRunId === first && item.confirmationId === 'removed'
  )), true);
});

test('concurrent imports preserve both receipts and immutable evidence snapshots', async () => {
  const h = atomicPrisma();
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';

  await Promise.all([
    applyRows(h.prisma, [row('same', { status: '*Onay Bekliyor' })], options(first)),
    applyRows(h.prisma, [row('same', { status: 'Tamamlandı' })], options(second)),
  ]);

  assert.deepEqual(h.committed.receipts.map((item) => item.id).sort(), [first, second]);
  assert.deepEqual(h.committed.evidence.map((item) => item.importRunId).sort(), [first, second]);
});

test('select, guard and delete are restricted to the closed verified receipt window', async () => {
  const before = row('before', { recordDate: new Date('2026-09-05T00:00:00.000Z') });
  const inside = row('inside-old', { recordDate: new Date('2026-09-10T00:00:00.000Z') });
  const after = row('after', { recordDate: new Date('2026-09-21T00:00:00.000Z') });
  const h = atomicPrisma({ confirmations: [before, inside, after] });

  const result = await applyRows(
    h.prisma,
    [row('inside-new')],
    options('11111111-1111-4111-8111-111111111111'),
  );

  assert.equal(result.deleted, 1);
  assert.deepEqual([...h.committed.confirmations.keys()].sort(), ['after', 'before', 'inside-new']);
});

test('dry-run uses the same closed verified window and never writes an import receipt', async () => {
  const h = atomicPrisma();

  const result = await applyRows(h.prisma, [row()], options(null, { dryRun: true }));

  assert.equal(result.dryRun, true);
  assert.equal(result.importRunId, undefined);
  assert.equal(h.committed.receipts.length, 0);
});
