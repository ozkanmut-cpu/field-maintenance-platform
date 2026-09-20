import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('maintenance completion sends a separately recorded maintained cooler count', () => {
  assert.match(api, /maintainedCoolerCount\??:\s*number/);
  assert.match(api, /missingMaintenanceExplanation\??:\s*string/);
  assert.match(app, /maintainedCoolerCount/);
  assert.match(app, /missingMaintenanceExplanation/);
  assert.match(app, /\.\.\.partialMaintenanceValues/);
});

test('completion shows total and maintained coolers and requires an explicit incomplete choice for a shortfall', () => {
  assert.match(app, /Toplam soğutucu/);
  assert.match(app, /Bakımı yapılan soğutucu/);
  assert.match(app, /Eksik bakımı tamamla/);
  assert.match(app, /Eksik bakım yapıldı/);
  assert.match(app, /Eksik bakım açıklaması/);
  assert.match(app, /partialMaintenanceMode !== 'INCOMPLETE'/);
});

test('partial-maintenance choice is accessible and its explanation is visible only after the incomplete choice', () => {
  const start = app.indexOf('function EquipmentConfirmView');
  const end = app.indexOf('\nfunction MaintenanceDatePicker', start);
  assert.ok(start >= 0 && end > start);
  const view = app.slice(start, end);
  assert.match(view, /<Choice accessibilityLabel="Eksik bakım yapıldı"/);
  assert.match(view, /partialMaintenanceMode==='INCOMPLETE'\?<TextInput accessibilityLabel="Eksik bakım açıklaması"/);
  assert.match(view, /setMaintainedCoolerCount\(value\.replace\(\/\[\^0-9\]\/g,''\)\); setPartialMaintenanceMode\('COMPLETE'\); setMissingMaintenanceExplanation\(''\)/);
});

test('mobile uses the stored point count as one operational total and sends corrections only by explicit intent', () => {
  assert.match(api, /equipmentCorrectionRequested\??:\s*boolean/);
  assert.match(app, /const operationalCoolerCount = task\.coolerCount \?\? equipmentValues\.coolerCount/);
  assert.match(app, /equipmentCorrectionPayload\(task, equipmentValues, equipmentCorrectionRequested\)/);
  const start = app.indexOf('function EquipmentConfirmView');
  const end = app.indexOf('\nfunction MaintenanceDatePicker', start);
  const view = app.slice(start, end);
  assert.match(view, /const operationalCoolerCount = task\.coolerCount \?\? Number\(equipment\.coolerCount\)/);
  assert.match(view, /requiresEquipmentCorrection\(task,/);
  assert.match(view, /Ekipman bilgisini güncelle/);
  assert.match(view, /equipmentCorrectionRequested/);
  assert.match(app, /\.\.\.equipmentCorrection/);
});

test('past-dated completion preserves its no-location request path while carrying partial maintenance evidence', () => {
  const start = app.indexOf('async function savePastCompletedTask');
  const end = app.indexOf('\n  async function completeTask', start);
  assert.ok(start >= 0 && end > start);
  const pastCompletion = app.slice(start, end);
  assert.match(pastCompletion, /\.\.\.partialMaintenanceValues/);
  assert.doesNotMatch(pastCompletion, /latitude:|longitude:|locationCapturedAt:/);
});
