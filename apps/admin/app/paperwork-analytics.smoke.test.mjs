import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./paperwork-management.tsx', import.meta.url), 'utf8');

test('paperwork analytics reuses the persisted list range and technician scope', () => {
  assert.ok(source.includes('/api/backend/maintenance/paperwork-analytics'));
  assert.match(source, /new URLSearchParams\(\{ from, to \}\)/);
  assert.match(source, /technicianId && technicianId !== 'ALL'/);
  assert.ok(source.includes('Evrak Tamamlanma Analitiği'));
});

test('paperwork analytics distinguishes arrival, resolution and pending-age buckets', () => {
  assert.ok(source.includes('Belge geliş medyanı'));
  assert.ok(source.includes('Durum netleşme medyanı'));
  assert.ok(source.includes('0–24 saat'));
  assert.ok(source.includes('24–48 saat'));
  assert.ok(source.includes('2–7 gün'));
  assert.ok(source.includes('7+ gün'));
});

test('analytics ignores stale responses and renders percentages after the value', () => {
  assert.match(source, /const requestEpoch = analyticsRequests\.current\.next\(\)[\s\S]*analyticsRequests\.current\.isCurrent\(requestEpoch\)/);
  assert.ok(source.includes('item.statusRates.present}%'));
  assert.ok(source.includes('item.statusRates.pending}%'));
  assert.ok(source.includes('item.statusRates.missing}%'));
});
