import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appFile = new URL('../CorporateApp.tsx', import.meta.url);

test('maintenance success is concise and returns the technician to the weekly work list', () => {
  const source = fs.readFileSync(appFile, 'utf8');

  assert.match(source, /Bakım kaydedildi/);
  assert.match(source, /SONRAKİ İŞE GEÇ/);
  assert.match(source, /İŞLERE DÖN/);
  assert.doesNotMatch(source, /İşlem zamanı ve saha konumu kaydedildi/);
});

test('a just-saved maintenance offers a short direct undo through the existing revert endpoint', () => {
  const source = fs.readFileSync(appFile, 'utf8');
  const api = fs.readFileSync(new URL('../api.ts', import.meta.url), 'utf8');

  assert.match(api, /export type MaintenanceCompletion = \{ id: string \}/);
  assert.match(source, /setSuccessVisitId\(result\.id\)/);
  assert.match(source, /function undoSuccessfulCompletion\(\)/);
  assert.match(source, /revertMaintenance\(successVisitId, 'Teknisyen yeni kaydı geri aldı'\)/);
  assert.match(source, /'GERİ ALINIYOR\.\.\.' : 'GERİ AL'/);
  assert.match(source, /Date\.now\(\) \+ 30_000/);
});
