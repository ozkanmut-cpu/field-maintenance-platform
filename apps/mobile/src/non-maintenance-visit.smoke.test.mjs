import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const navigation = fs.readFileSync(new URL('./mobile-navigation.ts', import.meta.url), 'utf8');

const labels = [
  'Arıza',
  'Arızalı Fıçı',
  'Tesis Kurulum',
  'Tesis Sökme',
  'Seyyar Kurulum',
  'Seyyar Sökme',
  'Smart Tap Kurulum',
  'Smart Tap Arıza',
  'Smart Tap Sökme',
  'Keşif',
];

test('all exact visit types are exposed by the mobile API contract and form', () => {
  for (const label of labels) {
    assert.match(app, new RegExp(label));
  }
  assert.match(api, /NonMaintenanceVisitType/);
  assert.match(api, /recordNonMaintenanceVisit/);
});
test('flow is entered from Jobs and is not a primary tab', () => {
  const tasksStart = app.indexOf('function TaskList');
  const tasksEnd = app.indexOf('\nfunction MissingItemsView', tasksStart);
  assert.ok(tasksStart >= 0 && tasksEnd > tasksStart);
  assert.match(app.slice(tasksStart, tasksEnd), /Bakım Dışı Ziyaret/);
  assert.match(app, /navigate\('NON_MAINTENANCE_VISIT'\)/);
  assert.doesNotMatch(navigation, /label:\s*'Bakım Dışı Ziyaret'/);
});

test('customer selector is searchable, proximity ordered and has explicit no-record choice', () => {
  assert.match(app, /sortNonMaintenanceCustomers/);
  assert.match(app, /matchesSearch\(nonMaintenanceSearch/);
  assert.match(app, /Müşteri kaydı yok/);
  assert.match(app, /distanceMeters/);
});

test('customerless flow offers EFESİM screenshot and a non-blocking explanation fallback', () => {
  assert.match(app, /EFESİM ekran görüntüsü/);
  assert.match(app, /Görsel yok, açıklamayla devam et/);
  assert.match(app, /visualExplanation/);
  assert.match(app, /efesimImageBase64/);
  const start = app.indexOf('async function saveNonMaintenanceVisit');
  const end = app.indexOf('\n  async function', start + 20);
  assert.ok(start >= 0 && end > start);
  const save = app.slice(start, end);
  assert.doesNotMatch(save, /currentLocation\(/);
});
test('success and history distinguish the visit without maintenance behaviors', () => {
  assert.match(app, /Bakım dışı ziyaret kaydedildi/);
  assert.match(app, /NON_MAINTENANCE_VISIT_SAVED/);
  assert.match(app, /historyLabel/);
  assert.doesNotMatch(api, /recordNonMaintenanceVisit[\s\S]*completeMaintenance/);
  assert.match(app, /i\.type==='NON_MAINTENANCE_VISIT'/);
});
