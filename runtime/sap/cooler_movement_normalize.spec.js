const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { persistCoolerMovement } = require('./cooler_movement_normalize');
const { persistNormalizedSource } = require('./sap_secondary_source_store');

test('Cooler Movement persists raw and normalized records without business interpretation', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-movement-'));
  try {
    const source = path.join(temp, 'movement.csv');
    const bytes = Buffer.from(
      'Hareket Tarihi;Seri No;Nokta Kodu;Açıklama\n20.09.2026; SN-1 ; P-1 ;\n',
      'utf8',
    );
    fs.writeFileSync(source, bytes);

    const result = persistCoolerMovement({
      file: source,
      acquiredAt: '2026-09-20T10:05:00.000Z',
      dateRange: { from: '2026-09-06', to: '2026-09-20' },
      storeDir: path.join(temp, 'store'),
    });

    assert.equal(result.source, 'SAP_COOLER_MOVEMENT');
    assert.equal(result.checksum, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(result.records, [{
      'Hareket Tarihi': '20.09.2026',
      'Seri No': 'SN-1',
      'Nokta Kodu': 'P-1',
      'Açıklama': null,
    }]);
    assert.deepEqual(fs.readFileSync(result.raw.file), bytes);
    assert.match(result.raw.file, /cooler-movement\/raw\//);
    assert.match(result.normalized.file, /cooler-movement\/normalized\//);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Cooler Movement rejects empty datasets and duplicate headers', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-movement-bad-'));
  try {
    const empty = path.join(temp, 'empty.csv');
    const duplicate = path.join(temp, 'duplicate.csv');
    fs.writeFileSync(empty, 'Hareket Tarihi;Seri No\n');
    fs.writeFileSync(duplicate, 'Seri No;Seri No\nSN-1;SN-2\n');

    assert.throws(
      () => persistCoolerMovement({
        file: empty,
        acquiredAt: '2026-09-20T10:05:00.000Z',
        dateRange: { from: '2026-09-06', to: '2026-09-20' },
        storeDir: path.join(temp, 'empty-store'),
      }),
      /no-data/,
    );
    assert.throws(
      () => persistCoolerMovement({
        file: duplicate,
        acquiredAt: '2026-09-20T10:05:00.000Z',
        dateRange: { from: '2026-09-06', to: '2026-09-20' },
        storeDir: path.join(temp, 'duplicate-store'),
      }),
      /duplicate-header/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Cooler Movement rejects an Export 1 shaped CSV as an unknown report layout', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-movement-wrong-report-'));
  try {
    const source = path.join(temp, 'export1.csv');
    const storeDir = path.join(temp, 'store');
    fs.writeFileSync(
      source,
      'Tanıtıcı;Nokta Kodu;Kayıt tarihi\nT-1;P-1;20.09.2026\n',
    );

    assert.throws(
      () => persistCoolerMovement({
        file: source,
        acquiredAt: '2026-09-20T10:05:00.000Z',
        dateRange: { from: '2026-09-06', to: '2026-09-20' },
        storeDir,
      }),
      /unknown-layout/,
    );
    assert.equal(fs.existsSync(storeDir), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Cooler Movement rejects movement dates outside the requested report range', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-movement-range-'));
  try {
    const source = path.join(temp, 'outside-range.csv');
    const storeDir = path.join(temp, 'store');
    fs.writeFileSync(
      source,
      'Hareket Tarihi;Seri No;Nokta Kodu\n05.09.2026;SN-1;P-1\n',
    );

    assert.throws(
      () => persistCoolerMovement({
        file: source,
        acquiredAt: '2026-09-20T10:05:00.000Z',
        dateRange: { from: '2026-09-06', to: '2026-09-20' },
        storeDir,
      }),
      /movement-date-outside-range/,
    );
    assert.equal(fs.existsSync(storeDir), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Cooler Movement requires a serial identity and rejects duplicate rows', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-movement-identity-'));
  try {
    const missingIdentity = path.join(temp, 'missing-identity.csv');
    const duplicate = path.join(temp, 'duplicate-row.csv');
    fs.writeFileSync(
      missingIdentity,
      'Hareket Tarihi;Seri No;Nokta Kodu\n20.09.2026;;P-1\n',
    );
    fs.writeFileSync(
      duplicate,
      'Hareket Tarihi;Seri No;Nokta Kodu\n20.09.2026;SN-1;P-1\n20.09.2026;SN-1;P-1\n',
    );
    const base = {
      acquiredAt: '2026-09-20T10:05:00.000Z',
      dateRange: { from: '2026-09-06', to: '2026-09-20' },
    };

    assert.throws(
      () => persistCoolerMovement({
        ...base,
        file: missingIdentity,
        storeDir: path.join(temp, 'missing-store'),
      }),
      /missing-row-identity/,
    );
    assert.throws(
      () => persistCoolerMovement({
        ...base,
        file: duplicate,
        storeDir: path.join(temp, 'duplicate-store'),
      }),
      /duplicate-row-identity/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('secondary persistence stores the exact bytes that produced normalized records', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-source-integrity-'));
  try {
    const source = path.join(temp, 'source.csv');
    const parsedBytes = Buffer.from('Column\noriginal\n');
    fs.writeFileSync(source, 'Column\nchanged-after-parse\n');

    const result = persistNormalizedSource({
      source: 'SAP_COOLER_MOVEMENT',
      slug: 'cooler-movement',
      file: source,
      acquiredAt: '2026-09-20T10:05:00.000Z',
      dateRange: { from: '2026-09-06', to: '2026-09-20' },
      storeDir: path.join(temp, 'store'),
      parsed: {
        encoding: 'utf8',
        headers: ['Column'],
        rows: [{ Column: 'original' }],
        rowCount: 1,
        rawBytes: parsedBytes,
      },
    });

    assert.deepEqual(fs.readFileSync(result.raw.file), parsedBytes);
    assert.equal(result.checksum, crypto.createHash('sha256').update(parsedBytes).digest('hex'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
