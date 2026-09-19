import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const customersFile = new URL('./CustomersScreen.tsx', import.meta.url);
const detailFile = new URL('./CustomerDetailScreen.tsx', import.meta.url);
const appFile = new URL('../CorporateApp.tsx', import.meta.url);

function source(file) {
  assert.ok(fs.existsSync(file), `${file.pathname} must exist`);
  return fs.readFileSync(file, 'utf8');
}

test('customer list searches every technician-visible identifier and signals equipment completeness', () => {
  const screen = source(customersFile);

  assert.match(screen, /matchesSearch\(search, \[customer\.name, customer\.code, customer\.region\?\.name \?\? '', customer\.address \?\? '', \.\.\.\(customer\.aliases \?\? \[\]\)\]\)/);
  assert.match(screen, /Ekipman bilgisi tamam/);
  assert.match(screen, /Ekipman bilgisi eksik/);
  assert.match(screen, /onOpenCustomer\(customer\)/);
});

test('customer list has loading, retry, refresh, and accessible customer actions', () => {
  const screen = source(customersFile);
  const app = source(appFile);

  assert.match(screen, /Müşteriler yükleniyor/);
  assert.match(screen, /Müşteriler yüklenemedi/);
  assert.match(screen, /TEKRAR DENE/);
  assert.match(screen, /accessibilityRole="button"/);
  assert.match(screen, /accessibilityLabel=\{`\$\{customer\.name\} müşteri detayını aç`\}/);
  assert.match(app, /RefreshControl/);
  assert.match(app, /accessibilityLabel="Müşterileri yenile"/);
});

test('customer detail keeps customer metadata read-only and limits editing to four equipment counts', () => {
  const detail = source(detailFile);

  for (const field of ['customer.name', 'customer.code', 'customer.region?.name', 'customer.address', 'customer.canonicalLatitude', 'customer.canonicalLongitude', 'customer.locationSource', 'customer.locationConfidence']) {
    assert.ok(detail.includes(field), `detail must present ${field}`);
  }
  assert.match(detail, /equipmentFields\.map/);
  assert.match(detail, /parseEquipment\(equipment\)/);
  assert.match(detail, /onSave\(parsed\.values\)/);
  assert.doesNotMatch(detail, /assignmentSource/);
});

test('customer equipment save preserves the existing API contract and refreshes the assignment-scoped list', () => {
  const app = source(appFile);

  assert.match(app, /updateCustomerEquipment\(selectedCustomer\.id, values\)/);
  assert.match(app, /const refreshed = await myCustomers\(\)/);
  assert.match(app, /CustomerDetailScreen/);
  assert.doesNotMatch(app, /<CustomerView/);
});

test('customer navigation keeps list loading state separate and sends only parsed equipment to the detail save handler', () => {
  const app = source(appFile);
  const detail = source(detailFile);

  assert.match(app, /const \[customersLoading, setCustomersLoading\] = useState\(false\)/);
  assert.match(app, /const \[customersError, setCustomersError\] = useState<string \| null>\(null\)/);
  assert.match(app, /<CustomersScreen[\s\S]*loading=\{customersLoading\}[\s\S]*error=\{customersError\}[\s\S]*onRefresh=\{\(\) => void loadCustomers\(\)\}/);
  assert.match(detail, /onSave\(parsed\.values\)/);
  assert.doesNotMatch(detail, /TextInput[\s\S]*customer\.(?:name|code|address)/);
});
