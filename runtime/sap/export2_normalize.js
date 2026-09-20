const { parseGenericCsvFile, persistNormalizedSource } = require('./sap_secondary_source_store');

function sapDateToIso(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || '').trim());
  if (!match) throw new Error('SAFE_ABORT_EXPORT2:invalid-record-date');
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  const iso = date.toISOString().slice(0, 10);
  if (iso !== `${match[3]}-${match[2]}-${match[1]}`) {
    throw new Error('SAFE_ABORT_EXPORT2:invalid-record-date');
  }
  return iso;
}

function validateExport2Rows(rows, dateRange) {
  const ids = rows.map((row) => String(row['Tanıtıcı'] || '').trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error('SAFE_ABORT_EXPORT2:missing-or-duplicate-id');
  }
  if (rows.some((row) => !String(row['Nokta Kodu'] || '').trim())) {
    throw new Error('SAFE_ABORT_EXPORT2:empty-point-code');
  }
  for (const row of rows) {
    const date = sapDateToIso(row['Kayıt tarihi']);
    if (date < dateRange.from || date > dateRange.to) {
      throw new Error('SAFE_ABORT_EXPORT2:record-date-outside-range');
    }
  }
  return rows;
}

function persistExport2(input) {
  const parsed = parseGenericCsvFile(input.file);
  for (const header of ['Tanıtıcı', 'Nokta Kodu', 'Kayıt tarihi']) {
    if (!parsed.headers.includes(header)) throw new Error(`SAFE_ABORT_EXPORT2:missing-column:${header}`);
  }
  validateExport2Rows(parsed.rows, input.dateRange);
  return persistNormalizedSource({
    ...input,
    source: 'SAP_EXPORT_2',
    slug: 'sap-export-2',
    parsed,
  });
}

module.exports = { persistExport2, sapDateToIso, validateExport2Rows };
