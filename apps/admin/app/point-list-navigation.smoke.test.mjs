import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const list = readFileSync(new URL('./point-list.tsx', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('./admin-navigation.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('./point-detail-page.tsx', import.meta.url), 'utf8');

test('point list persists its find context before navigating to a detail record', () => {
  assert.match(navigation, /status\?: string/);
  assert.match(navigation, /scrollY\?: string/);
  assert.match(navigation, /params\.get\('status'\)/);
  assert.match(navigation, /params\.get\('scrollY'\)/);
  assert.match(navigation, /params\.set\('status', values\.status\)/);
  assert.match(navigation, /params\.set\('scrollY', values\.scrollY\)/);
  assert.match(list, /window\.history\.replaceState/);
  assert.match(list, /scrollY = window\.scrollY/,
    'Detail navigation must capture the current list scroll position');
  assert.match(list, /onNavigate\('point-detail', \{ pointId: point\.id, \.\.\.values \}\)/);
  assert.match(list, /const visiblePage = visible\.slice/,
    'page must represent real client pagination, not a dead URL parameter');
  assert.match(list, /replaceListLocation\(next, status, 1\)/,
    'a query change must write the reset first page into the URL');
  assert.match(list, /replaceListLocation\(query, next, 1\)/,
    'a status change must write the reset first page into the URL');
});

test('point detail retains the list context while its tabs change', () => {
  assert.match(detail, /onNavigate\('point-detail', \{ pointId, detailTab, query: location\.query, status: location\.status, page: location\.page, scrollY: location\.scrollY \}\)/);
});
