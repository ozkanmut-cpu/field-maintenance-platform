import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const customersFile = new URL('./CustomersScreen.tsx', import.meta.url);
const customerDetailFile = new URL('./CustomerDetailScreen.tsx', import.meta.url);
const tasksFile = new URL('./TasksScreen.tsx', import.meta.url);

function source(file) {
  return fs.readFileSync(file, 'utf8');
}

test('customer search clear action keeps a 48 px touch target', () => {
  const customers = source(customersFile);

  assert.match(customers, /clearButton:\s*\{\s*width:\s*48,\s*minHeight:\s*48/);
});

test('assistance loading exposes progressbar semantics with its announcement', () => {
  const tasks = source(tasksFile);

  assert.match(tasks, /<ActivityIndicator accessibilityRole="progressbar" accessibilityLabel="Yardım listesi yükleniyor"/);
});

test('customer loading is announced and equipment inputs meet the 48 px target', () => {
  const customers = source(customersFile);
  const detail = source(customerDetailFile);

  assert.match(customers, /accessibilityRole="progressbar" accessibilityLabel="Müşteriler yükleniyor"/);
  assert.match(detail, /input:\s*\{[^}]*height:\s*48/);
});
