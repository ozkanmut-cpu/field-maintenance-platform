const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { decode, parseLine } = require('./sap_csv_validator');

function parseGenericCsvBytes(rawBytes) {
  const { encoding, text } = decode(rawBytes);
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines[0]?.trim().toLocaleLowerCase('tr-TR') === 'sep=;') lines.shift();
  if (lines.length < 2) throw new Error('SAFE_ABORT_SECONDARY_CSV:no-data');

  const headers = parseLine(lines.shift()).map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error('SAFE_ABORT_SECONDARY_CSV:empty-header');
  if (new Set(headers).size !== headers.length) {
    throw new Error('SAFE_ABORT_SECONDARY_CSV:duplicate-header');
  }

  const rows = lines.map((line, index) => {
    const values = parseLine(line);
    if (values.length === headers.length + 1 && values.at(-1) === '') values.pop();
    if (values.length !== headers.length) {
      throw new Error(`SAFE_ABORT_SECONDARY_CSV:column-count-row:${index + 2}`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });

  return { encoding, headers, rows, rowCount: rows.length, rawBytes };
}

function parseGenericCsvFile(file) {
  return parseGenericCsvBytes(fs.readFileSync(file));
}

function normalizeRecords(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const normalized = String(value ?? '').trim();
      return [key.trim(), normalized === '' ? null : normalized];
    }),
  ));
}

function validateMetadata(acquiredAt, dateRange) {
  const timestamp = new Date(acquiredAt);
  if (!acquiredAt || Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== acquiredAt) {
    throw new Error('SAFE_ABORT_SECONDARY_STORE:invalid-acquired-at');
  }
  const from = dateRange?.from;
  const to = dateRange?.to;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) {
    throw new Error('SAFE_ABORT_SECONDARY_STORE:invalid-date-range');
  }
  return { acquiredAt, dateRange: { from, to } };
}

function persistNormalizedSource({ source, slug, file, acquiredAt, dateRange, storeDir, parsed }) {
  const metadata = validateMetadata(acquiredAt, dateRange);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('SAFE_ABORT_SECONDARY_STORE:raw-source-not-regular-file');
  }

  const bytes = parsed.rawBytes;
  if (!Buffer.isBuffer(bytes)) throw new Error('SAFE_ABORT_SECONDARY_STORE:parsed-raw-bytes-missing');
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const records = normalizeRecords(parsed.rows);
  const id = `${acquiredAt.replace(/[:.]/g, '-')}-${checksum.slice(0, 16)}`;
  const sourceDir = path.join(storeDir, slug);
  const rawDir = path.join(sourceDir, 'raw');
  const normalizedDir = path.join(sourceDir, 'normalized');
  const rawFile = path.join(rawDir, `${id}.csv`);
  const normalizedFile = path.join(normalizedDir, `${id}.json`);
  const document = {
    schemaVersion: 1,
    source,
    acquiredAt: metadata.acquiredAt,
    dateRange: metadata.dateRange,
    checksum,
    encoding: parsed.encoding,
    headers: parsed.headers,
    rowCount: parsed.rowCount,
    records,
  };

  fs.mkdirSync(rawDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(normalizedDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(rawFile, bytes, { flag: 'wx', mode: 0o600 });
  try {
    fs.writeFileSync(normalizedFile, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    fs.unlinkSync(rawFile);
    throw error;
  }

  return {
    ...document,
    raw: { file: rawFile, size: bytes.length },
    normalized: { file: normalizedFile },
  };
}

module.exports = { normalizeRecords, parseGenericCsvBytes, parseGenericCsvFile, persistNormalizedSource };
