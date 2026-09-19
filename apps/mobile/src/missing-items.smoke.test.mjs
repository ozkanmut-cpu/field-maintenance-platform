import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('technician dashboard exposes the real missing paperwork payload', () => {
  assert.match(api, /export type MissingPaperworkItem =/);
  assert.match(api, /missingPaperwork:\s*number/);
  assert.match(api, /paperwork:\s*MissingPaperworkSummary/);
  assert.match(api, /missingItems:\s*MissingPaperworkItem\[\]/);
});

test('Jobs warns about missing paperwork and opens a read-only missing-items screen', () => {
  assert.match(app, /'MISSING_ITEMS'/);
  assert.match(app, /Eksik servis fişiniz veya teyidiniz var/);
  assert.match(app, /onOpenMissingItems/);
  assert.match(app, /function MissingItemsView/);
  assert.match(app, /Eksik teyit/);
  assert.match(app, /Eksik servis fişi/);
  assert.match(app, /yönetici incelemesi/i);
});

test('missing-items screen does not introduce technician approval or mutation actions', () => {
  const start = app.indexOf('function MissingItemsView');
  assert.ok(start >= 0);
  const view = app.slice(start, app.indexOf('\nfunction Summary', start));
  assert.doesNotMatch(view, /completeMaintenance|recordMaintenanceAttempt|jsonRequest|POST|PATCH|APPROVED/);
});

test('a record missing both documents contributes to both per-kind summary cards', () => {
  assert.match(app, /function missingPaperworkCounts\(items: MissingPaperworkItem\[\]\)/);
  assert.match(app, /if \(item\.confirmationStatus === 'MISSING'\) confirmation \+= 1/);
  assert.match(app, /if \(item\.serviceSlipStatus === 'MISSING'\) serviceSlip \+= 1/);
  assert.match(app, /const paperwork = missingPaperworkCounts\(items\)/);
  assert.match(app, /value=\{paperwork\.confirmation\}/);
  assert.match(app, /value=\{paperwork\.serviceSlip\}/);
});