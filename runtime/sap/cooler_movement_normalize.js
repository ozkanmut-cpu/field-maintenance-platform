const { parseGenericCsvFile, persistNormalizedSource } = require('./sap_secondary_source_store');

const REQUIRED_HEADERS = ['Hareket Tarihi', 'Seri No', 'Nokta Kodu'];

function sapDateToIso(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || '').trim());
  if (!match) throw new Error('SAFE_ABORT_MOVEMENT_SCHEMA:invalid-movement-date');
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  const iso = date.toISOString().slice(0, 10);
  if (iso !== `${match[3]}-${match[2]}-${match[1]}`) {
    throw new Error('SAFE_ABORT_MOVEMENT_SCHEMA:invalid-movement-date');
  }
  return iso;
}

function validateMovementRows(parsed, dateRange) {
  const missing = REQUIRED_HEADERS.filter((header) => !parsed.headers.includes(header));
  if (missing.length) {
    throw new Error(`SAFE_ABORT_MOVEMENT_SCHEMA:unknown-layout:missing:${missing.join(',')}`);
  }

  const identities = new Set();
  for (const row of parsed.rows) {
    if (!String(row['Seri No'] || '').trim()) {
      throw new Error('SAFE_ABORT_MOVEMENT_SCHEMA:missing-row-identity');
    }
    const movementDate = sapDateToIso(row['Hareket Tarihi']);
    if (movementDate < dateRange.from || movementDate > dateRange.to) {
      throw new Error('SAFE_ABORT_MOVEMENT_SCHEMA:movement-date-outside-range');
    }
    const identity = parsed.headers.map((header) => String(row[header] ?? '').trim()).join('\u001f');
    if (identities.has(identity)) {
      throw new Error('SAFE_ABORT_MOVEMENT_SCHEMA:duplicate-row-identity');
    }
    identities.add(identity);
  }
  return parsed.rows;
}

function persistCoolerMovement(input) {
  const parsed = parseGenericCsvFile(input.file);
  validateMovementRows(parsed, input.dateRange);
  return persistNormalizedSource({
    ...input,
    source: 'SAP_COOLER_MOVEMENT',
    slug: 'cooler-movement',
    parsed,
  });
}

module.exports = { persistCoolerMovement, REQUIRED_HEADERS, sapDateToIso, validateMovementRows };
