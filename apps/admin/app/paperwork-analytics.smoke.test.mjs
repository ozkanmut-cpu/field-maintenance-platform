import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./paperwork-management.tsx', import.meta.url), 'utf8');

test('paperwork management loads admin completion analytics with an independent range and technician filter', () => {
  assert.ok(source.includes('/api/backend/maintenance/paperwork-analytics'));
  assert.ok(source.includes('analyticsTechnicianId'));
  assert.ok(source.includes('analyticsFrom'));
  assert.ok(source.includes('analyticsTo'));
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

test('analytics clears stale results before reloading and renders percentages after the value', () => {
  assert.match(source, /async function loadAnalytics\(\)[\s\S]*setAnalytics\(null\)[\s\S]*setAnalyticsLoading\(true\)/);
  assert.ok(source.includes('item.statusRates.present}%'));
  assert.ok(source.includes('item.statusRates.pending}%'));
  assert.ok(source.includes('item.statusRates.missing}%'));
});
