const { RunState } = require('./sap_run_state');
const { validateCsvFile } = require('./sap_csv_validator');
const { validateData } = require('./sap_csv_safety');
const { incomingRow } = require('./sap_reconciliation');
const { applyRows } = require('./sap_db_writer');
const { buildImportEvidence } = require('./sap_import_metadata');

function dateOnly(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  return new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`);
}

function money(value) {
  if (!value) return null;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(parsed)) throw new Error('SAFE_ABORT_E2E:money');
  return parsed;
}

async function runE2eShadow(file, prisma, { acquiredAt = new Date() } = {}) {
  const state = new RunState();
  state.advance('AUTHENTICATED').advance('CRM_VERIFIED').advance('SEARCH_VERIFIED').advance('EXPORTED');
  const csv = validateCsvFile(file);
  validateData(csv.rows, { now: acquiredAt.getTime() });
  state.advance('CSV_VALIDATED');
  const rows = csv.rows.map((row) => incomingRow(row, dateOnly, money));
  const evidence = buildImportEvidence(acquiredAt);
  const db = await applyRows(prisma, rows, {
    dryRun: true,
    acquiredAt,
    windowStart: new Date(`${evidence.windowStart}T00:00:00.000Z`),
    windowEnd: new Date(`${evidence.windowEnd}T00:00:00.000Z`),
  });
  return { shadow: true, state: state.state, history: state.history, csvRows: csv.rowCount, db };
}

module.exports = { runE2eShadow };
