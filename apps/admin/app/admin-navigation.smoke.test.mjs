import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const navigationPath = new URL('./admin-navigation.ts', import.meta.url);

test('admin navigation registry defines deep-linkable point workflows', () => {
  assert.equal(existsSync(navigationPath), true);
  const source = readFileSync(navigationPath, 'utf8');
  assert.match(source, /'points'/);
  assert.match(source, /'point-detail'/);
  assert.match(source, /'bulk-operations'/);
  assert.match(source, /admin-navigation-runtime/,
    'URL behavior is covered by executable helper tests rather than source-shape assertions');
});

test('navigation registry groups every existing admin capability', () => {
  assert.equal(existsSync(navigationPath), true);
  const source = readFileSync(navigationPath, 'utf8');
  for (const group of ['Ana Sayfa', 'Operasyon', 'Onay & İnceleme', 'Nokta Yönetimi', 'Raporlar & Analiz', 'Entegrasyonlar', 'Kullanıcı Yönetimi', 'Sistem']) {
    assert.match(source, new RegExp(group));
  }
});
