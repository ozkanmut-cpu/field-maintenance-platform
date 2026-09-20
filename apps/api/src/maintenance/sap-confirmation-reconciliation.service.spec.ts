import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SapConfirmationReconciliationService } from './sap-confirmation-reconciliation.service';

type VisitRow = {
  id: string;
  pointId: string;
  performedAt: Date;
  recordedAtServer: Date;
  coolerCount: number | null;
  maintainedCoolerCount?: number | null;
  confirmationStatus: string;
  confirmationApprovalSource: string | null;
  confirmationEvidenceAcquiredAt: Date | null;
  confirmationEvidenceImportRunId: string | null;
  status: 'VALID' | 'REVERSED';
  confirmationReconciliationEligible: boolean;
  point: { code: string; maintenanceType: 'STANDARD' | 'SMARTCLEAN' };
};

type ConfirmationRow = {
  pointCode: string;
  recordDate: Date;
  status: string | null;
  lastSeenImportId: string;
};

type EvidenceRow = {
  confirmationId: string;
  importRunId: string;
  pointCode: string;
  recordDate: Date;
  status: string | null;
};

type ReceiptRow = {
  id: string;
  source: 'MAIN_CONFIRMATION_203';
  status: 'SUCCESS';
  acquiredAt: Date;
  completedAt: Date;
  windowStart: Date;
  windowEnd: Date;
  reconciledAt: Date | null;
};

function receipt(overrides: Partial<ReceiptRow> = {}): ReceiptRow {
  return {
    id: 'receipt-1',
    source: 'MAIN_CONFIRMATION_203',
    status: 'SUCCESS',
    acquiredAt: new Date('2026-09-20T11:55:00.000Z'),
    completedAt: new Date('2026-09-20T12:00:00.000Z'),
    windowStart: new Date('2026-09-06T00:00:00.000Z'),
    windowEnd: new Date('2026-09-20T00:00:00.000Z'),
    reconciledAt: null,
    ...overrides,
  };
}

function visit(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    id: 'visit-1',
    pointId: 'point-1',
    performedAt: new Date('2026-09-19T08:00:00.000Z'),
    recordedAtServer: new Date('2026-09-19T08:05:00.000Z'),
    coolerCount: 1,
    maintainedCoolerCount: null,
    confirmationStatus: 'PENDING',
    confirmationApprovalSource: null,
    confirmationEvidenceAcquiredAt: null,
    confirmationEvidenceImportRunId: null,
    status: 'VALID',
    confirmationReconciliationEligible: true,
    point: { code: 'P1', maintenanceType: 'STANDARD' },
    ...overrides,
  };
}

function confirmation(overrides: Partial<ConfirmationRow> = {}): ConfirmationRow {
  return {
    pointCode: 'P1',
    recordDate: new Date('2026-09-19T00:00:00.000Z'),
    status: '*Onay Bekliyor',
    lastSeenImportId: 'receipt-1',
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    confirmationId: 'confirmation-1',
    importRunId: 'receipt-1',
    pointCode: 'P1',
    recordDate: new Date('2026-09-19T00:00:00.000Z'),
    status: '*Onay Bekliyor',
    ...overrides,
  };
}

function harness(input: {
  receipt?: ReceiptRow | null;
  receipts?: ReceiptRow[];
  visits?: VisitRow[];
  confirmations?: ConfirmationRow[];
  evidence?: EvidenceRow[];
  beforeConditionalWrite?: (row: VisitRow) => void;
}) {
  const rows = input.visits ?? [visit()];
  const receipts = new Map(
    (input.receipts ?? (input.receipt === null ? [] : [input.receipt ?? receipt()]))
      .map((row) => [row.id, row]),
  );
  const confirmations = input.confirmations ?? [confirmation()];
  const evidenceRows = input.evidence ?? confirmations.map((row) => ({
    importRunId: row.lastSeenImportId,
    pointCode: row.pointCode,
    recordDate: row.recordDate,
    status: row.status,
  }));
  const updates: any[] = [];
  const audits: any[] = [];
  let visitQuery: any;
  let beforeWriteRan = false;

  const findVisits = async (args: any) => {
    visitQuery = args;
    return rows.filter((row) =>
      row.status === args.where.status
      && row.confirmationReconciliationEligible === args.where.confirmationReconciliationEligible
      && row.recordedAtServer < args.where.recordedAtServer.lt
      && row.performedAt >= args.where.performedAt.gte
      && row.performedAt < args.where.performedAt.lt);
  };
  const findConfirmations = async ({ where }: any) => confirmations.filter((row) =>
    row.lastSeenImportId === where.lastSeenImportId
    && where.pointCode.in.includes(row.pointCode)
    && row.recordDate >= where.recordDate.gte
    && row.recordDate <= where.recordDate.lte);
  const findEvidence = async ({ where }: any) => evidenceRows.filter((row) =>
    row.importRunId === where.importRunId
    && where.pointCode.in.includes(row.pointCode)
    && row.recordDate >= where.recordDate.gte
    && row.recordDate <= where.recordDate.lte);
  const runBeforeWrite = (row: VisitRow) => {
    if (!beforeWriteRan) {
      beforeWriteRan = true;
      input.beforeConditionalWrite?.(row);
    }
  };

  const tx: any = {
    maintenanceVisit: {
      findMany: findVisits,
      update: async (args: any) => {
        const row = rows.find((item) => item.id === args.where.id)!;
        runBeforeWrite(row);
        updates.push(args);
        Object.assign(row, args.data);
        return row;
      },
      updateMany: async (args: any) => {
        const row = rows.find((item) => item.id === args.where.id)!;
        runBeforeWrite(row);
        const order = args.where.OR;
        const acquiredAt = order?.[1]?.confirmationEvidenceAcquiredAt?.lt;
        const importRunId = order?.[2]?.OR?.[1]?.confirmationEvidenceImportRunId?.lt;
        const evidenceIsNewer = !order || (Boolean(acquiredAt) && (
          row.confirmationEvidenceAcquiredAt === null
          || row.confirmationEvidenceAcquiredAt < acquiredAt
          || (
            row.confirmationEvidenceAcquiredAt.getTime() === acquiredAt.getTime()
            && (
              row.confirmationEvidenceImportRunId === null
              || row.confirmationEvidenceImportRunId < importRunId
            )
          )
        ));
        if (
          row.status !== args.where.status
          || row.confirmationReconciliationEligible !== args.where.confirmationReconciliationEligible
          || row.confirmationStatus !== args.where.confirmationStatus
          || row.confirmationApprovalSource !== args.where.confirmationApprovalSource
          || row.confirmationApprovalSource === 'MANUAL_ADMIN'
          || !evidenceIsNewer
        ) return { count: 0 };
        updates.push(args);
        Object.assign(row, args.data);
        return { count: 1 };
      },
    },
    sapConfirmation: { findMany: findConfirmations },
    sapConfirmationImportEvidence: { findMany: findEvidence },
    sapConfirmationReconciliation: {
      create: async (args: any) => {
        audits.push(args);
        return args.data;
      },
    },
    sapImportRun: {
      update: async ({ where, data }: any) => {
        const run = receipts.get(where.id);
        if (run) Object.assign(run, data);
        return run ?? {};
      },
    },
  };

  const prisma: any = {
    sapImportRun: {
      findUnique: async ({ where }: any) => receipts.get(where.id) ?? null,
      updateMany: async ({ where }: any) => ({ count: receipts.has(where.id) ? 1 : 0 }),
      update: async ({ where, data }: any) => {
        const run = receipts.get(where.id);
        if (run) Object.assign(run, data);
        return run ?? {};
      },
    },
    $transaction: async (work: (client: any) => Promise<any>) => work(tx),
  };

  return {
    service: new SapConfirmationReconciliationService(prisma),
    rows,
    updates,
    audits,
    visitQuery: () => visitQuery,
  };
}

test('only an exact point and Istanbul maintenance date can resolve confirmation', async () => {
  const h = harness({ evidence: [evidence({ recordDate: new Date('2026-09-20T00:00:00.000Z') })] });

  await h.service.reconcileCommittedImport('receipt-1');

  assert.equal(h.rows[0].confirmationStatus, 'MISSING');
  assert.equal(h.audits[0].data.sapCount, 0);
  assert.equal(h.audits[0].data.maintenanceDate.toISOString().slice(0, 10), '2026-09-19');
});

test('backlogged receipt uses its immutable evidence after a newer import retags the live row', async () => {
  const h = harness({
    confirmations: [confirmation({ lastSeenImportId: 'receipt-2', status: 'Tamamlandı' })],
    evidence: [evidence({ importRunId: 'receipt-1', status: '*Onay Bekliyor' })],
  });

  await h.service.reconcileCommittedImport('receipt-1');

  assert.equal(h.rows[0].confirmationStatus, 'PRESENT');
  assert.equal(h.audits[0].data.sapCount, 1);
});

test('an older insufficient receipt cannot overwrite a newer AUTO_SAP approval', async () => {
  const olderId = '11111111-1111-4111-8111-111111111111';
  const newerId = '22222222-2222-4222-8222-222222222222';
  const h = harness({
    receipts: [
      receipt({ id: olderId, acquiredAt: new Date('2026-09-20T10:00:00.000Z') }),
      receipt({ id: newerId, acquiredAt: new Date('2026-09-20T11:00:00.000Z') }),
    ],
    evidence: [evidence({ importRunId: newerId, status: 'Tamamlandı' })],
  });

  await h.service.reconcileCommittedImport(newerId);
  await h.service.reconcileCommittedImport(olderId);

  assert.equal(h.rows[0].confirmationStatus, 'APPROVED');
  assert.equal(h.rows[0].confirmationApprovalSource, 'AUTO_SAP');
  assert.equal(h.rows[0].confirmationEvidenceAcquiredAt?.toISOString(), '2026-09-20T11:00:00.000Z');
  assert.equal(h.rows[0].confirmationEvidenceImportRunId, newerId);
  assert.equal(h.audits.length, 1);
  assert.equal(h.audits[0].data.importRunId, newerId);
});

test('unchanged newer evidence advances watermark and rejects an older replay', async () => {
  const olderId = '11111111-1111-4111-8111-111111111111';
  const newerId = '22222222-2222-4222-8222-222222222222';
  const h = harness({
    receipts: [
      receipt({ id: olderId, acquiredAt: new Date('2026-09-20T10:00:00.000Z') }),
      receipt({ id: newerId, acquiredAt: new Date('2026-09-20T11:00:00.000Z') }),
    ],
    visits: [visit({ confirmationStatus: 'APPROVED', confirmationApprovalSource: 'AUTO_SAP' })],
    evidence: [evidence({ importRunId: newerId, status: 'Tamamlandı' })],
  });

  await h.service.reconcileCommittedImport(newerId);
  await h.service.reconcileCommittedImport(olderId);

  assert.equal(h.rows[0].confirmationStatus, 'APPROVED');
  assert.equal(h.rows[0].confirmationEvidenceAcquiredAt?.toISOString(), '2026-09-20T11:00:00.000Z');
  assert.equal(h.rows[0].confirmationEvidenceImportRunId, newerId);
  assert.equal(h.updates.length, 1, 'newer unchanged evidence must perform a watermark-only write');
  assert.equal(h.audits.length, 0);
});

test('equal acquisition timestamps use receipt id as a deterministic watermark tiebreaker', async () => {
  const lowerId = '11111111-1111-4111-8111-111111111111';
  const higherId = '22222222-2222-4222-8222-222222222222';
  const acquiredAt = new Date('2026-09-20T11:00:00.000Z');
  const h = harness({
    receipts: [
      receipt({ id: lowerId, acquiredAt }),
      receipt({ id: higherId, acquiredAt }),
    ],
    visits: [visit({ confirmationStatus: 'APPROVED', confirmationApprovalSource: 'AUTO_SAP' })],
    evidence: [
      evidence({ importRunId: lowerId, status: 'Tamamlandı' }),
      evidence({ importRunId: higherId, status: 'Tamamlandı' }),
    ],
  });

  await h.service.reconcileCommittedImport(higherId);
  await h.service.reconcileCommittedImport(lowerId);

  assert.equal(h.rows[0].confirmationEvidenceImportRunId, higherId);
  assert.equal(h.updates.length, 1);
  assert.equal(h.audits.length, 0);
});

test('an interleaved newer reconciliation watermark makes the older conditional write stale', async () => {
  const olderId = '11111111-1111-4111-8111-111111111111';
  const newerId = '22222222-2222-4222-8222-222222222222';
  const newerAcquiredAt = new Date('2026-09-20T11:00:00.000Z');
  const h = harness({
    receipts: [receipt({ id: olderId, acquiredAt: new Date('2026-09-20T10:00:00.000Z') })],
    evidence: [],
    beforeConditionalWrite: (row) => {
      row.confirmationEvidenceAcquiredAt = newerAcquiredAt;
      row.confirmationEvidenceImportRunId = newerId;
    },
  });

  await h.service.reconcileCommittedImport(olderId);

  assert.equal(h.rows[0].confirmationStatus, 'PENDING');
  assert.equal(h.rows[0].confirmationEvidenceImportRunId, newerId);
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('manual approval remains locked after later PRESENT, MISSING or AUTO_SAP evidence', async () => {
  for (const evidenceRows of [
    [evidence({ status: '*Onay Bekliyor' })],
    [],
    [evidence({ status: 'Tamamlandı' })],
  ]) {
    const h = harness({
      visits: [visit({ confirmationStatus: 'APPROVED', confirmationApprovalSource: 'MANUAL_ADMIN' })],
      evidence: evidenceRows,
    });
    await h.service.reconcileCommittedImport('receipt-1');
    assert.equal(h.rows[0].confirmationStatus, 'APPROVED');
    assert.equal(h.rows[0].confirmationApprovalSource, 'MANUAL_ADMIN');
    assert.equal(h.updates.length, 0);
    assert.equal(h.audits.length, 0);
  }
});

test('interleaved manual approval wins atomically and creates no reconciliation audit', async () => {
  const h = harness({
    beforeConditionalWrite: (row) => {
      row.confirmationStatus = 'APPROVED';
      row.confirmationApprovalSource = 'MANUAL_ADMIN';
    },
  });

  await h.service.reconcileCommittedImport('receipt-1');

  assert.equal(h.rows[0].confirmationStatus, 'APPROVED');
  assert.equal(h.rows[0].confirmationApprovalSource, 'MANUAL_ADMIN');
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('interleaved reversal prevents reconciliation and audit', async () => {
  const h = harness({ beforeConditionalWrite: (row) => { row.status = 'REVERSED'; } });

  await h.service.reconcileCommittedImport('receipt-1');

  assert.equal(h.rows[0].confirmationStatus, 'PENDING');
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('a committed exact-date import maps waiting evidence to PRESENT and final evidence to AUTO_SAP APPROVED', async () => {
  const waiting = harness({ evidence: [evidence({ status: '*Onay Bekliyor' })] });
  await waiting.service.reconcileCommittedImport('receipt-1');
  assert.equal(waiting.rows[0].confirmationStatus, 'PRESENT');

  const approved = harness({ evidence: [evidence({ status: 'Tamamlandı' })] });
  await approved.service.reconcileCommittedImport('receipt-1');
  assert.equal(approved.rows[0].confirmationStatus, 'APPROVED');
  assert.equal(approved.rows[0].confirmationApprovalSource, 'AUTO_SAP');
});

test('an import without a committed receipt never creates MISSING', async () => {
  const h = harness({ receipt: null, evidence: [] });
  const result = await h.service.reconcileCommittedImport('failed-receipt');
  assert.equal(result.updated, 0);
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('required confirmation count prefers maintainedCoolerCount and falls back to legacy coolerCount', async () => {
  const fourEvidence = Array.from(
    { length: 4 },
    (_, index) => evidence({ confirmationId: `confirmation-${index + 1}`, status: '*Onay Bekliyor' }),
  );
  const covered = harness({
    visits: [visit({ coolerCount: 5, maintainedCoolerCount: 4 })],
    evidence: fourEvidence,
  });
  await covered.service.reconcileCommittedImport('receipt-1');
  assert.equal(covered.rows[0].confirmationStatus, 'PRESENT');
  assert.equal(covered.audits[0].data.requiredConfirmationCount, 4);

  const short = harness({
    visits: [visit({ coolerCount: 5, maintainedCoolerCount: 4 })],
    evidence: fourEvidence.slice(0, 3),
  });
  await short.service.reconcileCommittedImport('receipt-1');
  assert.equal(short.rows[0].confirmationStatus, 'MISSING');
  assert.equal(short.audits[0].data.requiredConfirmationCount, 4);

  const legacy = harness({ visits: [visit({ coolerCount: 2, maintainedCoolerCount: null })], evidence: [evidence({ status: 'Tamamlandı' })] });
  await legacy.service.reconcileCommittedImport('receipt-1');
  assert.equal(legacy.rows[0].confirmationStatus, 'MISSING');
  assert.equal(legacy.audits[0].data.requiredConfirmationCount, 2);
});

test('zero maintained coolers require no SAP confirmation and remain unchanged', async () => {
  const h = harness({ visits: [visit({ coolerCount: 5, maintainedCoolerCount: 0 })], evidence: [] });

  await h.service.reconcileCommittedImport('receipt-1');

  assert.equal(h.rows[0].confirmationStatus, 'PENDING');
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('reconciliation uses export acquisition time, not later DB commit time', async () => {
  const h = harness({});
  await h.service.reconcileCommittedImport('receipt-1');
  assert.equal(h.visitQuery().where.recordedAtServer.lt.toISOString(), '2026-09-20T11:55:00.000Z');
});

test('maintenance recorded after the export snapshot is not marked MISSING', async () => {
  const h = harness({
    visits: [visit({ recordedAtServer: new Date('2026-09-20T11:57:00.000Z') })],
    evidence: [],
  });

  await h.service.reconcileCommittedImport('receipt-1');

  assert.equal(h.rows[0].confirmationStatus, 'PENDING');
  assert.equal(h.updates.length, 0);
  assert.equal(h.audits.length, 0);
});

test('performedAt is matched by Europe/Istanbul calendar date', async () => {
  const h = harness({
    visits: [visit({ performedAt: new Date('2026-09-18T22:30:00.000Z') })],
    evidence: [evidence({ recordDate: new Date('2026-09-19T00:00:00.000Z') })],
  });
  await h.service.reconcileCommittedImport('receipt-1');
  assert.equal(h.rows[0].confirmationStatus, 'PRESENT');
});
