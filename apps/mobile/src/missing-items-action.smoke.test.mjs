import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('Eksikler offers Tamamladım only for missing service slips and refreshes after the technician handoff', () => {
  assert.match(api, /export function completeMissingServiceSlip/);
  assert.match(api, /\/maintenance\/service-slip\/complete/);
  const start = app.indexOf('function MissingItemsView');
  const view = app.slice(start, app.indexOf('\nfunction Summary', start));
  assert.match(view, /serviceSlipStatus === 'MISSING'/);
  assert.match(view, /TAMAMLADIM/);
  assert.match(view, /onCompleteServiceSlip/);
  assert.match(app, /onCompleteServiceSlip=\{completeServiceSlipReview\}/);
  assert.match(app, /await completeMissingServiceSlip\(visitId\);[\s\S]*await loadTasks\(\)/);
  assert.match(app, /setDashboard\(\(current\) => markServiceSlipUnderReview\(current, visitId\)\)/);
  assert.match(app, /if \(refreshed\) Alert\.alert\('Servis fişi incelemeye gönderildi'/);
  assert.match(view, /PENDING_REVIEW/);
  assert.match(view, /disabled=\{loading \|\| busy\}/);
});

test('the mobile completion action does not expose a final approval choice', () => {
  const start = app.indexOf('function MissingItemsView');
  const view = app.slice(start, app.indexOf('\nfunction Summary', start));
  assert.doesNotMatch(view, /APPROVED|Onayla|approve/i);
});
