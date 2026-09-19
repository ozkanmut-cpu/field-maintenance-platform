import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('maintenance completion exposes an explicit performed date and optional GPS payload', () => {
  assert.match(api, /performedAt\?:\s*string/);
  assert.match(api, /latitude\?:\s*number/);
  assert.match(api, /locationCapturedAt\?:\s*string/);
});

test('equipment confirmation uses a bounded date picker and requires a late reason', () => {
  assert.match(app, /MaintenanceDatePicker/);
  assert.match(app, /previousWeekMonday/);
  assert.match(app, /Geriye dönük bakım nedeni/);
  assert.match(app, /selectedDateKey/);
});

test('past-dated mobile completion bypasses current GPS confirmation flow', () => {
  assert.match(app, /if \(isPastMaintenanceDate\(selectedDateKey\)\)/);
  assert.match(app, /savePastCompletedTask/);
});
