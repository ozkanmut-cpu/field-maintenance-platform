const { same, guard } = require('./sap_reconciliation');
const { buildImportEvidence } = require('./sap_import_metadata');

async function applyRows(
  prisma,
  rows,
  {
    dryRun = false,
    importRunId = null,
    acquiredAt,
    completedAt = new Date(),
    windowStart,
    windowEnd,
  } = {},
) {
  if (!rows.length) throw new Error('SAP import cannot create a receipt without rows');
  if (!(acquiredAt instanceof Date) || Number.isNaN(acquiredAt.getTime())) {
    throw new Error('SAP import receipt acquisition time is required');
  }
  if (!(windowStart instanceof Date) || Number.isNaN(windowStart.getTime())) {
    throw new Error('SAP import receipt window start is required');
  }
  if (!(windowEnd instanceof Date) || Number.isNaN(windowEnd.getTime())) {
    throw new Error('SAP import receipt window end is required');
  }
  if (windowStart > windowEnd) throw new Error('SAP import receipt window is invalid');
  const expectedWindow = buildImportEvidence(acquiredAt);
  if (
    windowStart.toISOString().slice(0, 10) !== expectedWindow.windowStart
    || windowEnd.toISOString().slice(0, 10) !== expectedWindow.windowEnd
  ) {
    throw new Error('SAP import receipt window does not match acquisition time');
  }
  if (rows.some((row) => row.recordDate < windowStart || row.recordDate > windowEnd)) {
    throw new Error('SAP import row falls outside the receipt window');
  }
  const ids = rows.map((row) => row.confirmationId);
  const current = await prisma.sapConfirmation.findMany({
    where: { productId: '203', recordDate: { gte: windowStart, lte: windowEnd } },
    select: { confirmationId: true, status: true, recordDate: true },
  });
  const existing = await prisma.sapConfirmation.findMany({
    where: { confirmationId: { in: ids } },
  });
  const byId = new Map(existing.map((row) => [row.confirmationId, row]));
  const deleteGuard = guard(rows, current);
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let deleted = 0;
  for (const row of rows) {
    const previous = byId.get(row.confirmationId);
    if (!previous) inserted += 1;
    else if (same(previous, row)) unchanged += 1;
    else updated += 1;
  }

  if (dryRun) {
    return {
      dryRun: true,
      rows: rows.length,
      inserted,
      updated,
      unchanged,
      deleted: 0,
      wouldDelete: deleteGuard.allowDelete ? deleteGuard.missingCurrent : 0,
      blockedDeletes: deleteGuard.allowDelete ? 0 : deleteGuard.missingCurrent,
      deleteGuard,
      cutoff: windowStart,
    };
  }

  if (!importRunId) throw new Error('SAP import receipt id is required for a real sync');

  await prisma.$transaction(async (tx) => {
    await tx.sapImportRun.create({
      data: {
        id: importRunId,
        source: 'MAIN_CONFIRMATION_203',
        status: 'SUCCESS',
        windowStart,
        windowEnd,
        rowCount: rows.length,
        acquiredAt,
        completedAt,
      },
    });

    await tx.sapConfirmationImportEvidence.createMany({
      data: rows.map((row) => ({
        importRunId,
        confirmationId: row.confirmationId,
        pointCode: row.pointCode,
        recordDate: row.recordDate,
        status: row.status,
        productId: row.productId,
      })),
    });

    for (const row of rows) {
      const data = {
        ...row,
        lastSeenImportId: importRunId,
        sourceSyncedAt: completedAt,
      };
      await tx.sapConfirmation.upsert({
        where: { confirmationId: row.confirmationId },
        create: data,
        update: data,
      });
    }

    if (deleteGuard.allowDelete) {
      const result = await tx.sapConfirmation.deleteMany({
        where: {
          productId: '203',
          recordDate: { gte: windowStart, lte: windowEnd },
          confirmationId: { notIn: ids },
        },
      });
      deleted = result.count;
    }
  }, { timeout: 60_000 });

  return {
    dryRun: false,
    importRunId,
    rows: rows.length,
    inserted,
    updated,
    unchanged,
    deleted,
    blockedDeletes: deleteGuard.allowDelete ? 0 : deleteGuard.missingCurrent,
    deleteGuard,
    cutoff: windowStart,
  };
}

module.exports = { applyRows };
