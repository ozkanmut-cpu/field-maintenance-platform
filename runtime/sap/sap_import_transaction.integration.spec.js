const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { applyRows } = require('./sap_db_writer');

const databaseUrl = process.env.SAP_TRANSACTION_TEST_DATABASE_URL;

function row(confirmationId, status = '*Onay Bekliyor') {
  return {
    confirmationId,
    pointCode: 'INTEGRATION-P1',
    recordDate: new Date('2026-09-19T00:00:00.000Z'),
    productId: '203',
    status,
  };
}

function options(importRunId, hour) {
  return {
    importRunId,
    acquiredAt: new Date(`2026-09-20T${hour}:55:00.000Z`),
    completedAt: new Date(`2026-09-20T${hour}:59:00.000Z`),
    windowStart: new Date('2026-09-06T00:00:00.000Z'),
    windowEnd: new Date('2026-09-20T00:00:00.000Z'),
  };
}

test('PostgreSQL transaction preserves sequential and concurrent import evidence', {
  skip: databaseUrl ? false : 'set SAP_TRANSACTION_TEST_DATABASE_URL to an isolated migrated PostgreSQL database',
}, async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const runIds = Array.from({ length: 5 }, () => crypto.randomUUID());
  const confirmationIds = Array.from({ length: 3 }, () => `integration-${crypto.randomUUID()}`);
  const cleanup = async () => {
    await prisma.sapConfirmation.deleteMany({ where: { confirmationId: { in: confirmationIds } } });
    await prisma.sapImportRun.deleteMany({ where: { id: { in: runIds } } });
  };
  t.after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
  await cleanup();

  await applyRows(prisma, [row(confirmationIds[0])], options(runIds[0], '10'));
  await applyRows(prisma, [row(confirmationIds[0], 'Tamamlandı')], options(runIds[1], '11'));

  const sequentialEvidence = await prisma.sapConfirmationImportEvidence.findMany({
    where: { importRunId: { in: runIds.slice(0, 2) } },
    orderBy: { importRunId: 'asc' },
  });
  assert.equal(sequentialEvidence.length, 2);
  assert.deepEqual(new Set(sequentialEvidence.map((item) => item.status)), new Set(['*Onay Bekliyor', 'Tamamlandı']));

  await Promise.all([
    applyRows(prisma, [row(confirmationIds[1])], options(runIds[2], '12')),
    applyRows(prisma, [row(confirmationIds[1], 'Tamamlandı')], options(runIds[3], '13')),
  ]);
  assert.equal(await prisma.sapImportRun.count({ where: { id: { in: runIds.slice(2, 4) } } }), 2);
  assert.equal(await prisma.sapConfirmationImportEvidence.count({
    where: { importRunId: { in: runIds.slice(2, 4) } },
  }), 2);

  await assert.rejects(
    () => applyRows(prisma, [row(confirmationIds[2], '*Onay Bekliyor'), {
      ...row(`invalid-${crypto.randomUUID()}`),
      pointCode: null,
    }], options(runIds[4], '14')),
  );
  assert.equal(await prisma.sapImportRun.count({ where: { id: runIds[4] } }), 0);
  assert.equal(await prisma.sapConfirmationImportEvidence.count({ where: { importRunId: runIds[4] } }), 0);
});
