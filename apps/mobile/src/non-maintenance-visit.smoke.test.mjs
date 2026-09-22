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
test('flow is entered from My Customers and is not a primary tab', () => {
  const tasksStart = app.indexOf('function TaskList');
  const tasksEnd = app.indexOf('\nfunction MissingItemsView', tasksStart);
  assert.ok(tasksStart >= 0 && tasksEnd > tasksStart);
  assert.doesNotMatch(app.slice(tasksStart, tasksEnd), /Bakım Dışı Ziyaret/);

  const customersStart = app.indexOf('function CustomersView');
  const customersEnd = app.indexOf('\nfunction CustomerView', customersStart);
  assert.ok(customersStart >= 0 && customersEnd > customersStart);
  const customersView = app.slice(customersStart, customersEnd);
  assert.match(customersView, /Bakım Dışı Ziyaret/);
  assert.match(customersView, /accessibilityLabel="Bakım dışı ziyaret başlat"/);
  assert.match(customersView, /onPress=\{openNonMaintenance\}/);
  assert.match(app, /openNonMaintenance=\{\(\)\s*=>\s*void openNonMaintenanceVisit\(\)\}/);
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

test('immediate Jobs entry refreshes location before fetching and renders the matching distance origin', () => {
  const start = app.indexOf('async function openNonMaintenanceVisit');
  const end = app.indexOf('\n  function chooseNonMaintenanceCustomer', start);
  const open = app.slice(start, end);
  const locationIndex = open.indexOf('const origin = await refreshDeviceLocation()');
  const customersIndex = open.indexOf('await myCustomers()');
  assert.ok(locationIndex >= 0 && customersIndex > locationIndex, 'location must be refreshed before customers are fetched');
  assert.match(open, /setNonMaintenanceOrigin\(origin\)/);
  assert.match(app, /origin=\{nonMaintenanceOrigin\}/);
});

test('denied or unavailable location visibly falls back to deterministic alphabetical customer order', () => {
  assert.match(app, /if \(!permission\.granted \|\| !\(await Location\.hasServicesEnabledAsync\(\)\)\) return null/);
  assert.match(app, /Konum alınamadı; müşteriler alfabetik gösteriliyor\./);
  const sortStart = app.indexOf('function sortNonMaintenanceCustomers');
  const sortEnd = app.indexOf('\nfunction NonMaintenanceCustomerView', sortStart);
  const sort = app.slice(sortStart, sortEnd);
  assert.match(sort, /if \(!origin\) return customers\.slice\(\)\.sort/);
  assert.match(sort, /localeCompare/);
});
