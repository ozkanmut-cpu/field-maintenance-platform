import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');

test('technician history type and UI expose all partial-maintenance evidence', () => {
  const historyType = api.slice(api.indexOf('export type TechnicianHistoryItem'), api.indexOf('\nexport function revertMaintenance'));
  assert.match(historyType, /totalCoolerCount\?:\s*number \| null/);
  assert.match(historyType, /maintainedCoolerCount\?:\s*number \| null/);
  assert.match(historyType, /missingMaintenanceCount\?:\s*number \| null/);
  assert.match(historyType, /missingMaintenanceExplanation\?:\s*string \| null/);
  assert.match(historyType, /maintenanceSummary\?:\s*string \| null/);

  const historyView = app.slice(app.indexOf('function HistoryView'), app.indexOf('\nfunction NewPointView'));
  assert.match(historyView, /i\.maintenanceSummary/);
  assert.match(historyView, /soğutucu bakım/);
  assert.match(historyView, /i\.maintainedCoolerCount/);
  assert.match(historyView, /i\.totalCoolerCount/);
  assert.match(historyView, /i\.missingMaintenanceCount/);
  assert.match(historyView, /i\.missingMaintenanceExplanation/);
});
