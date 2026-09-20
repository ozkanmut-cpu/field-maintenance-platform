const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { createSourceStore, runFullChain } = require('./sap_full_chain_orchestrator');

function fixtureFile(dir, name, contents) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

test('full chain acquires, validates, receipts, and audits each source in strict order', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-full-chain-'));
  try {
    const calls = [];
    const store = createSourceStore({
      root: path.join(temp, 'source-store'),
      now: () => new Date('2026-09-20T12:00:00.000Z'),
      audit: (event) => calls.push(`audit:${event.source}`),
    });
    const source = (name) => async () => {
      calls.push(`acquire:${name}`);
      return { file: fixtureFile(temp, `${name}.csv`, `id;value\n${name};ok\n`) };
    };
    const validate = (name) => (result) => {
      calls.push(`validate:${name}`);
      assert.match(fs.readFileSync(result.file, 'utf8'), new RegExp(name));
      return { rowCount: 1, normalized: [{ id: name, value: 'ok' }] };
    };

    const result = await runFullChain({
      store,
      acquireExport1: source('export1'),
      validateExport1: validate('export1'),
      acquireExport2: source('export2'),
      validateExport2: validate('export2'),
      acquireCoolerMovement: source('cooler-movement'),
      validateCoolerMovement: validate('cooler-movement'),
    });

    assert.deepEqual(calls, [
      'acquire:export1', 'validate:export1', 'audit:EXPORT_1',
      'acquire:export2', 'validate:export2', 'audit:EXPORT_2',
      'acquire:cooler-movement', 'validate:cooler-movement', 'audit:COOLER_MOVEMENT',
    ]);
    assert.deepEqual(result.receipts.map((receipt) => receipt.source), ['EXPORT_1', 'EXPORT_2', 'COOLER_MOVEMENT']);
    for (const receipt of result.receipts) {
      assert.equal(receipt.validated, true);
      assert.equal(receipt.metadata.rowCount, 1);
      assert.equal(receipt.audit.recorded, true);
      assert.equal(fs.existsSync(receipt.raw.file), true);
      assert.equal(fs.existsSync(receipt.normalized.file), true);
      assert.equal(fs.existsSync(receipt.receipt.file), true);
      assert.equal(fs.existsSync(receipt.audit.file), true);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('a failed validation prevents all downstream acquisition and writes no receipt', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-full-chain-fail-'));
  try {
    const calls = [];
    const store = createSourceStore({ root: path.join(temp, 'source-store') });

    await assert.rejects(
      () => runFullChain({
        store,
        acquireExport1: async () => {
          calls.push('export1');
          return { file: fixtureFile(temp, 'export1.csv', 'broken') };
        },
        validateExport1: () => { throw new Error('SAFE_ABORT_CSV:no-data'); },
        acquireExport2: async () => calls.push('export2'),
        validateExport2: () => ({ rowCount: 1 }),
        acquireCoolerMovement: async () => calls.push('cooler'),
        validateCoolerMovement: () => ({ rowCount: 1 }),
      }),
      /SAFE_ABORT_CHAIN:EXPORT_1:SAFE_ABORT_CSV:no-data/,
    );

    assert.deepEqual(calls, ['export1']);
    assert.equal(fs.existsSync(path.join(temp, 'source-store')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('source store rejects root and traversal paths while keeping artifacts beneath its root', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-full-chain-root-'));
  try {
    assert.throws(() => createSourceStore({ root: '/' }), /unsafe-root/);
    assert.throws(() => createSourceStore({ root: 'relative-store' }), /unsafe-root/);
    const linkedRoot = path.join(temp, 'linked-root');
    fs.symlinkSync('/', linkedRoot);
    assert.throws(() => createSourceStore({ root: linkedRoot }), /unsafe-root/);

    const root = path.join(temp, 'store');
    const store = createSourceStore({ root, now: () => new Date('2026-09-20T12:00:00.000Z') });
    const file = fixtureFile(temp, 'input.csv', 'id;value\n1;ok\n');
    const receipt = store.recordValidated({
      source: 'EXPORT_1',
      slug: '../escape',
      file,
      validation: { rowCount: 1, normalized: [{ id: '1', value: 'ok' }] },
    });

    for (const artifact of [receipt.raw.file, receipt.normalized.file, receipt.receipt.file]) {
      assert.equal(path.relative(root, artifact).startsWith('..'), false);
    }
    assert.equal(receipt.metadata.source, 'EXPORT_1');
    assert.equal(receipt.metadata.checksum.length, 64);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('source store rejects a symlinked intermediate directory without writing outside its root', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-full-chain-symlink-'));
  try {
    const root = path.join(temp, 'store');
    const outside = path.join(temp, 'outside');
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(root, 'export-1'));
    const store = createSourceStore({ root });
    const file = fixtureFile(temp, 'input.csv', 'id;value\n1;ok\n');

    assert.throws(
      () => store.recordValidated({
        source: 'EXPORT_1',
        file,
        validation: { rowCount: 1, normalized: [{ id: '1', value: 'ok' }] },
      }),
      /unsafe-directory|symlink|path-escapes-root/,
    );
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('an audit sink failure rolls back the current source artifacts and blocks downstream acquisition', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-full-chain-audit-fail-'));
  try {
    const root = path.join(temp, 'store');
    const calls = [];
    const store = createSourceStore({
      root,
      audit: () => { throw new Error('audit-unavailable'); },
    });

    await assert.rejects(
      () => runFullChain({
        store,
        acquireExport1: async () => {
          calls.push('export1');
          return { file: fixtureFile(temp, 'export1.csv', 'id;value\n1;ok\n') };
        },
        validateExport1: () => ({ rowCount: 1, normalized: [{ id: '1', value: 'ok' }] }),
        acquireExport2: async () => calls.push('export2'),
        validateExport2: () => ({ rowCount: 1, normalized: [] }),
        acquireCoolerMovement: async () => calls.push('cooler'),
        validateCoolerMovement: () => ({ rowCount: 1, normalized: [] }),
      }),
      /SAFE_ABORT_CHAIN:EXPORT_1:audit-unavailable/,
    );

    assert.deepEqual(calls, ['export1']);
    assert.equal(fs.existsSync(path.join(root, 'export-1', 'raw')), false);
    assert.equal(fs.existsSync(path.join(root, 'export-1', 'normalized')), false);
    assert.equal(fs.existsSync(path.join(root, 'export-1', 'receipts')), false);
    assert.equal(fs.existsSync(path.join(root, 'audit')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
