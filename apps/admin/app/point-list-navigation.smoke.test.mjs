import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const list = readFileSync(new URL('./point-list.tsx', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('./admin-navigation.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('./point-detail-page.tsx', import.meta.url), 'utf8');

test('point list persists its find context before navigating to a detail record', () => {
  assert.match(navigation, /status\?: string/);
  assert.match(navigation, /scrollY\?: string/);
  assert.match(navigation, /admin-navigation-runtime/,
    'the executable navigation helper owns URL parsing and building');
  assert.match(navigation, /region\?: string/);
  assert.match(navigation, /maintenanceType\?: string/);
  assert.match(list, /window\.history\.replaceState/);
  assert.match(list, /scrollY = window\.scrollY/,
    'Detail navigation must capture the current list scroll position');
  assert.match(list, /onNavigate\('point-detail', \{ pointId: point\.id, \.\.\.values \}\)/);
  assert.match(list, /const groupedVisible = groupPointsByIdentity\(visible\)/,
    'repeated point records must be grouped before client pagination');
  assert.match(list, /const visibleGroups = groupedVisible\.slice/,
    'page must represent grouped client pagination, not a dead URL parameter');
  assert.match(list, /pushListLocation\(next, status, region, maintenanceType, 1\)/,
    'a query change must push the reset first page into browser history');
  assert.match(list, /pushListLocation\(query, next, region, maintenanceType, 1\)/,
    'a status change must push the reset first page into browser history');
});

test('point detail retains the list context while its tabs change', () => {
  assert.match(detail, /onNavigate\('point-detail', \{ pointId, detailTab, query: location\.query, status: location\.status, region: location\.region, maintenanceType: location\.maintenanceType, page: location\.page, scrollY: location\.scrollY \}\)/);
});
