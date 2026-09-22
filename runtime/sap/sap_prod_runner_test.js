const test = require('node:test');
const assert = require('node:assert/strict');

const {
  allowLiveDbApply,
  acquireExport1,
  buildDbArgs,
  executeProductionChain,
  failurePayload,
  requireCredentialEnv,
  runSapChain,
  syncExport1Result,
} = require('./sap_prod_runner');
const { buildImportEvidence } = require('./sap_import_metadata');

test('runner utility contracts load without the production Playwright installation', () => {
  assert.equal(allowLiveDbApply({}), false);
  assert.equal(allowLiveDbApply({ SAP_ALLOW_LIVE_DB_APPLY: 'true' }), false);
  assert.equal(allowLiveDbApply({ SAP_ALLOW_LIVE_DB_APPLY: '1' }), true);
  assert.throws(() => requireCredentialEnv({}), /credentials-missing/);
  assert.deepEqual(requireCredentialEnv({ SAP_USERNAME: 'u', SAP_PASSWORD: 'p' }), { username: 'u', password: 'p' });
  const evidence = buildImportEvidence(new Date('2026-09-20T12:00:00.000Z'));
  assert.deepEqual(buildDbArgs('/tmp/x.csv', true, evidence), ['--dry-run', '--acquired-at', '2026-09-20T12:00:00.000Z', '--window-start', '2026-09-06', '--window-end', '2026-09-20', '/tmp/x.csv']);
  assert.deepEqual(buildDbArgs('/tmp/x.csv', false, evidence), ['--acquired-at', '2026-09-20T12:00:00.000Z', '--window-start', '2026-09-06', '--window-end', '2026-09-20', '/tmp/x.csv']);
});

test('runner failure payload preserves the stack and emits only allowed diagnostic fields', () => {
  const error = new Error('SAFE_ABORT_EXPORT2_STATE:slot-added');
  error.stack = 'safe stack';
  error.diagnostic = {
    reason: 'slot-added',
    addedSlots: [{ slot: 5, key: 'PLANT', value1State: 'empty', value2State: 'control-missing', rawValue: 'do-not-log' }],
    rawHtml: '<input>',
  };

  assert.deepEqual(failurePayload(error), {
    ok: false,
    error: 'SAFE_ABORT_EXPORT2_STATE:slot-added',
    stack: 'safe stack',
    diagnostic: {
      reason: 'slot-added',
      addedSlots: [{ slot: 5, key: 'PLANT', value1State: 'empty', value2State: 'control-missing' }],
    },
  });
});

test('Export 1 captures the complete active search state before executing its search', async () => {
  const calls = [];
  const searchState = {
    max: '1000',
    slots: [
      { slot: 1, key: 'DATE_RANGE', value1: '<- 14 gün ->', value2: null },
      { slot: 2, key: 'PRODUCT_ID', value1: '203', value2: null },
      { slot: 3, key: 'REGION', value1: 'İzmir', value2: '' },
    ],
  };
  const run = { advance: (state) => calls.push(`state:${state}`) };
  const result = await acquireExport1({}, run, {
    now: Date.parse('2026-09-20T12:00:00.000Z'),
    downloadDir: '/runtime/downloads/export1',
    deps: {
      navigate: async () => calls.push('navigate'),
      resolveFrame: async () => { calls.push('frame'); return {}; },
      configure: async () => { calls.push('configure'); return { slots: {}, values: {} }; },
      capture: async () => { calls.push('capture'); return searchState; },
      clickSearch: async () => calls.push('search'),
      waitForResults: async () => { calls.push('results'); return { export: {} }; },
      download: async (_page, _meta, options) => {
        calls.push('download');
        assert.equal(options.dir, '/runtime/downloads/export1');
        return { file: '/runtime/downloads/export1/export.csv', downloadValidated: true };
      },
      validateCsv: () => { calls.push('csv'); return { rows: [{}], rowCount: 1 }; },
      validateRows: () => { calls.push('data'); return { oldest: '2026-09-06', newest: '2026-09-20' }; },
    },
  });

  assert.deepEqual(calls, [
    'navigate',
    'frame',
    'configure',
    'capture',
    'search',
    'state:SEARCH_VERIFIED',
    'results',
    'download',
    'state:EXPORTED',
    'csv',
    'data',
    'state:CSV_VALIDATED',
  ]);
  assert.deepEqual(result.searchState, searchState);
  assert.deepEqual(result.importEvidence, buildImportEvidence(new Date('2026-09-20T12:00:00.000Z')));
});

function stored(source) {
  return {
    source,
    checksum: 'a'.repeat(64),
    rowCount: 1,
    raw: { file: `/store/${source}/raw.csv` },
    normalized: { file: `/store/${source}/normalized.json` },
  };
}

test('runner validates and persists both secondary sources before Export 1 business sync', async () => {
  const calls = [];
  const result = await runSapChain({
    acquireExport1: async () => { calls.push('export1'); return { file: '/download/export1.csv', downloadValidated: true, csvValidated: true }; },
    acquireExport2: async () => { calls.push('export2'); return { file: '/download/export2.csv' }; },
    persistExport2: async () => { calls.push('persist2'); return stored('SAP_EXPORT_2'); },
    acquireCoolerMovement: async () => { calls.push('movement'); return { file: '/download/movement.csv' }; },
    persistCoolerMovement: async () => { calls.push('persist3'); return stored('SAP_COOLER_MOVEMENT'); },
    syncExport1: async () => { calls.push('sync1'); return { ok: true }; },
  });

  assert.deepEqual(calls, ['export1', 'export2', 'persist2', 'movement', 'persist3', 'sync1']);
  assert.equal(result.export2.source, 'SAP_EXPORT_2');
  assert.equal(result.coolerMovement.source, 'SAP_COOLER_MOVEMENT');
  assert.deepEqual(result.businessSync, { ok: true });
});

test('Export 1 validation failure prevents all secondary acquisition and business sync', async () => {
  const calls = [];
  await assert.rejects(
    () => runSapChain({
      acquireExport1: async () => ({ file: '/download/export1.csv', downloadValidated: true, csvValidated: false }),
      acquireExport2: async () => { calls.push('export2'); },
      persistExport2: async () => { calls.push('persist2'); },
      acquireCoolerMovement: async () => { calls.push('movement'); },
      persistCoolerMovement: async () => { calls.push('persist3'); },
      syncExport1: async () => { calls.push('sync1'); },
    }),
    /export1-not-validated/,
  );
  assert.deepEqual(calls, []);
});

test('Export 2 validation failure prevents movement acquisition and business sync', async () => {
  const calls = [];
  await assert.rejects(
    () => runSapChain({
      acquireExport1: async () => ({ file: '/download/export1.csv', downloadValidated: true, csvValidated: true }),
      acquireExport2: async () => { calls.push('export2'); return { file: '/download/export2.csv' }; },
      persistExport2: async () => { calls.push('persist2'); throw new Error('SAFE_ABORT_EXPORT2:invalid'); },
      acquireCoolerMovement: async () => { calls.push('movement'); },
      persistCoolerMovement: async () => { calls.push('persist3'); },
      syncExport1: async () => { calls.push('sync1'); },
    }),
    /SAFE_ABORT_EXPORT2:invalid/,
  );
  assert.deepEqual(calls, ['export2', 'persist2']);
});

test('Cooler Movement validation failure prevents business sync', async () => {
  const calls = [];
  await assert.rejects(
    () => runSapChain({
      acquireExport1: async () => ({ file: '/download/export1.csv', downloadValidated: true, csvValidated: true }),
      acquireExport2: async () => ({ file: '/download/export2.csv' }),
      persistExport2: async () => stored('SAP_EXPORT_2'),
      acquireCoolerMovement: async () => { calls.push('movement'); return { file: '/download/movement.csv' }; },
      persistCoolerMovement: async () => { calls.push('persist3'); throw new Error('SAFE_ABORT_MOVEMENT:no-data'); },
      syncExport1: async () => { calls.push('sync1'); },
    }),
    /SAFE_ABORT_MOVEMENT:no-data/,
  );
  assert.deepEqual(calls, ['movement', 'persist3']);
});

test('Export 1 business sync applies to the live database only with explicit opt-in', async () => {
  const calls = [];
  const run = { advance: (state) => calls.push(['advance', state]) };
  const evidence = buildImportEvidence(new Date('2026-09-20T12:00:00.000Z'));
  const result = await syncExport1Result({ file: '/download/export1.csv', importEvidence: evidence }, run, {
    allowLiveApply: true,
    runDbFn: (file, dryRun, receivedEvidence) => {
      calls.push(['db', file, dryRun, receivedEvidence]);
      return dryRun ? { ok: true, blockedDeletes: 0 } : { ok: true, inserted: 1 };
    },
  });

  assert.deepEqual(calls, [
    ['db', '/download/export1.csv', true, evidence],
    ['db', '/download/export1.csv', false, evidence],
    ['advance', 'DB_SYNCED'],
  ]);
  assert.deepEqual(result.db, { ok: true, inserted: 1 });
});

test('default Export 1 business sync never applies to the live database', async () => {
  const calls = [];
  const run = { advance: (state) => calls.push(['advance', state]) };
  const evidence = buildImportEvidence(new Date('2026-09-20T12:00:00.000Z'));
  const result = await syncExport1Result({ file: '/download/export1.csv', importEvidence: evidence }, run, {
    runDbFn: (_file, dryRun) => {
      calls.push(dryRun ? 'dry' : 'live');
      return { blockedDeletes: 0, ok: true, inserted: 1 };
    },
  });

  assert.deepEqual(calls, ['dry', ['advance', 'DRY_RUN_COMPLETE']]);
  assert.equal(result.db, undefined);
  assert.equal(result.dryRunComplete, true);
});

test('production chain derives live apply only from the exact environment opt-in', async () => {
  for (const [value, expectLiveApply] of [[undefined, false], ['true', false], ['1', true]]) {
    const calls = [];
    const run = { advance: (state) => calls.push(['advance', state]) };
    await executeProductionChain({}, run, {
      env: value === undefined ? {} : { SAP_ALLOW_LIVE_DB_APPLY: value },
      runSapChainFn: async (adapters) => adapters.syncExport1({ file: '/download/export1.csv' }),
      runDbFn: (_file, dryRun) => {
        calls.push(dryRun ? 'dry' : 'live');
        return dryRun ? { ok: true, blockedDeletes: 0 } : { ok: true };
      },
    });
    assert.deepEqual(calls, expectLiveApply ? ['dry', 'live', ['advance', 'DB_SYNCED']] : ['dry', ['advance', 'DRY_RUN_COMPLETE']]);
  }
});

test('a failed Export 1 shadow sync never completes or applies', async () => {
  for (const allowLiveApply of [false, true]) {
    const calls = [];
    const run = { advance: (state) => calls.push(['advance', state]) };
    await assert.rejects(
      () => syncExport1Result({ file: '/download/export1.csv' }, run, {
        allowLiveApply,
        runDbFn: (_file, dryRun) => {
          calls.push(dryRun ? 'dry' : 'live');
          return { ok: false, blockedDeletes: 0 };
        },
      }),
      /shadow-not-ok/,
    );
    assert.deepEqual(calls, ['dry']);
  }
});

test('blocked Export 1 dry-run prevents the real business write', async () => {
  const calls = [];
  const evidence = buildImportEvidence(new Date('2026-09-20T12:00:00.000Z'));
  await assert.rejects(
    () => syncExport1Result({ file: '/download/export1.csv', importEvidence: evidence }, { advance: () => calls.push('advance') }, {
      runDbFn: (_file, dryRun) => {
        calls.push(dryRun ? 'dry' : 'real');
        return { blockedDeletes: 3, ok: true };
      },
    }),
    /blocked-deletes/,
  );
  assert.deepEqual(calls, ['dry']);
});
