import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');

test('points screen exposes guarded bulk selection and the bulk API contract', () => {
  assert.ok(source.includes('/api/backend/points/bulk-update'));
  assert.ok(source.includes('selectedPointIds'));
  assert.ok(source.includes('GÖRÜNENLERİ SEÇ'));
  assert.ok(source.includes('SEÇİMİ TEMİZLE'));
  assert.ok(source.includes('SEÇİLİLERE UYGULA'));
  assert.ok(source.includes('SET_REGION'));
  assert.ok(source.includes('SET_STATUS'));
  assert.ok(source.includes('SET_STANDARD_WEEK'));
  assert.ok(source.includes('SET_SMARTCLEAN'));
  assert.ok(source.includes('En fazla 500'));
});

test('bulk UI requires explicit confirmation before mutation', () => {
  assert.match(source, /window\.confirm\(/);
  assert.ok(source.includes('nokta'));
});


test('bulk selection cannot silently survive a filter change', () => {
  assert.match(source, /function handlePointSearchChange[\s\S]*setSelectedPointIds\(\[\]\)/);
  assert.match(source, /function handlePointStatusFilterChange[\s\S]*setSelectedPointIds\(\[\]\)/);
  assert.ok(source.includes('setSelectedPointIds(visiblePoints.map((point) => point.id))'));
});
