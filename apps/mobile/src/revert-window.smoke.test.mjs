import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');

test('history exposes server-authorized revert eligibility and renders GERI AL only for it', () => {
  const historyType = api.slice(api.indexOf('export type TechnicianHistoryItem'), api.indexOf('\nexport function revertMaintenance'));
  assert.match(historyType, /revertEligible\?:\s*boolean/);

  const historyView = app.slice(app.indexOf('function HistoryView'), app.indexOf('\nfunction NewPointView'));
  assert.match(historyView, /i\.type==='MAINTENANCE'&&i\.revertEligible/);
});
