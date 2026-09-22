const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { persistExport2, validateExport2Rows } = require('./export2_normalize');

test('Export 2 persists an immutable raw copy and normalized source envelope', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-export2-'));
  try {
    const source = path.join(temp, 'download.csv');
    const bytes = Buffer.from(
      'Tanıtıcı;Nokta Kodu;Kayıt tarihi;Ürün Tanıtıcısı;Not\nT-1;P-1;20.09.2026;204;  örnek  \n',
      'utf8',
    );
    fs.writeFileSync(source, bytes);

    const result = persistExport2({
      file: source,
      acquiredAt: '2026-09-20T10:00:00.000Z',
      dateRange: { from: '2026-09-06', to: '2026-09-20' },
      storeDir: path.join(temp, 'store'),
    });

    assert.equal(result.source, 'SAP_EXPORT_2');
    assert.equal(result.acquiredAt, '2026-09-20T10:00:00.000Z');
    assert.deepEqual(result.dateRange, { from: '2026-09-06', to: '2026-09-20' });
    assert.equal(result.checksum, crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.rowCount, 1);
    assert.deepEqual(result.records, [{
      'Tanıtıcı': 'T-1',
      'Nokta Kodu': 'P-1',
      'Kayıt tarihi': '20.09.2026',
      'Ürün Tanıtıcısı': '204',
      'Not': 'örnek',
    }]);
    assert.deepEqual(fs.readFileSync(result.raw.file), bytes);
    assert.deepEqual(JSON.parse(fs.readFileSync(result.normalized.file, 'utf8')).records, result.records);
    assert.match(result.raw.file, /sap-export-2\/raw\//);
    assert.match(result.normalized.file, /sap-export-2\/normalized\//);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Export 2 rejects malformed rows before persisting anything', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-export2-bad-'));
  try {
    const source = path.join(temp, 'bad.csv');
    fs.writeFileSync(source, 'Tanıtıcı;Nokta Kodu;Kayıt tarihi\nT-1;P-1\n');
    const storeDir = path.join(temp, 'store');

    assert.throws(
      () => persistExport2({
        file: source,
        acquiredAt: '2026-09-20T10:00:00.000Z',
        dateRange: { from: '2026-09-06', to: '2026-09-20' },
        storeDir,
      }),
      /column-count/,
    );
    assert.equal(fs.existsSync(storeDir), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Export 2 rejects rows outside the declared 14-day acquisition range', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-export2-range-'));
  try {
    const source = path.join(temp, 'outside-range.csv');
    fs.writeFileSync(
      source,
      'Tanıtıcı;Nokta Kodu;Kayıt tarihi\nT-1;P-1;05.09.2026\n',
    );
    const storeDir = path.join(temp, 'store');

    assert.throws(
      () => persistExport2({
        file: source,
        acquiredAt: '2026-09-20T10:00:00.000Z',
        dateRange: { from: '2026-09-06', to: '2026-09-20' },
        storeDir,
      }),
      /record-date-outside-range/,
    );
    assert.equal(fs.existsSync(storeDir), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Export 2 range rejection attaches only canonical safe date diagnostic fields', () => {
  const rows = [{
    'Tanıtıcı': 'T-raw-identifier',
    'Nokta Kodu': 'P-customer-point',
    'Kayıt tarihi': '05.09.2026',
    'Müşteri Adı': 'Do Not Log Ltd.',
  }];

  assert.throws(
    () => validateExport2Rows(rows, { from: '2026-09-06', to: '2026-09-20' }),
    (error) => {
      assert.equal(error.message, 'SAFE_ABORT_EXPORT2:record-date-outside-range');
      assert.deepEqual(error.diagnostic, {
        reason: 'record-date-outside-range',
        rowIndex: 0,
        dateField: 'Kayıt tarihi',
        recordDate: '2026-09-05',
        windowStart: '2026-09-06',
        windowEnd: '2026-09-20',
        direction: 'before-start',
      });
      return true;
    },
  );
});

test('Export 2 keeps in-range records unchanged', () => {
  const rows = [{ 'Tanıtıcı': 'T-1', 'Nokta Kodu': 'P-1', 'Kayıt tarihi': '20.09.2026' }];
  assert.equal(validateExport2Rows(rows, { from: '2026-09-06', to: '2026-09-20' }), rows);
});

test('Export 2 rejects missing or duplicate confirmation identities', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-export2-identity-'));
  try {
    const duplicate = path.join(temp, 'duplicate.csv');
    const missingPoint = path.join(temp, 'missing-point.csv');
    fs.writeFileSync(
      duplicate,
      'Tanıtıcı;Nokta Kodu;Kayıt tarihi\nT-1;P-1;20.09.2026\nT-1;P-2;20.09.2026\n',
    );
    fs.writeFileSync(
      missingPoint,
      'Tanıtıcı;Nokta Kodu;Kayıt tarihi\nT-2;;20.09.2026\n',
    );
    const input = {
      acquiredAt: '2026-09-20T10:00:00.000Z',
      dateRange: { from: '2026-09-06', to: '2026-09-20' },
    };

    assert.throws(
      () => persistExport2({ ...input, file: duplicate, storeDir: path.join(temp, 'duplicate-store') }),
      /missing-or-duplicate-id/,
    );
    assert.throws(
      () => persistExport2({ ...input, file: missingPoint, storeDir: path.join(temp, 'point-store') }),
      /empty-point-code/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
