import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');

test('history supports server-authorized maintenance and non-maintenance visit reverts', () => {
  const historyType = api.slice(api.indexOf('export type TechnicianHistoryItem'), api.indexOf('\nexport function technicianHistory'));
  assert.match(historyType, /revertEligible\?:\s*boolean/);
  assert.match(api, /export function revertNonMaintenanceVisit\(visitId: string, reason: string\)/);
  assert.match(api, /'\/maintenance\/non-maintenance-visit\/revert'/);

  const historyView = app.slice(app.indexOf('function HistoryView'), app.indexOf('\nfunction NewPointView'));
  assert.match(historyView, /Bugün ve dün girilen bakım ve bakım dışı ziyaret kayıtlarını kontrol edebilir/);
  assert.match(historyView, /\(i\.type==='MAINTENANCE'\|\|i\.type==='NON_MAINTENANCE_VISIT'\)&&i\.revertEligible/);

  const revertFlow = app.slice(app.indexOf('function confirmRevert'), app.indexOf('\n  function equipmentFrom'));
  assert.match(revertFlow, /item\.type !== 'MAINTENANCE' && item\.type !== 'NON_MAINTENANCE_VISIT'/);
  assert.match(revertFlow, /revertNonMaintenanceVisit\(item\.id,/);
  assert.match(revertFlow, /Ziyaret kaydı geri alındı\./);
  assert.doesNotMatch(revertFlow, /ziyaret kaydı geri alınacak ve görev yeniden açılacak/);
});
