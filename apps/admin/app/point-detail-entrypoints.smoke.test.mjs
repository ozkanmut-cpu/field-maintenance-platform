import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('SAP/Google, duplicate, timeline, and setup queues open the real point detail', () => {
  const locationMatching = source('location-matching.tsx');
  const duplicates = source('duplicate-suggestions.tsx');
  const timeline = source('point-timeline.tsx');
  const operations = source('operations.tsx');

  assert.match(locationMatching, /onNavigate\('point-detail', \{ pointId: point\.id \}\)/,
    'SAP / Google comparison must open the selected point rather than a matching-only view');
  assert.match(duplicates, /onNavigate\('point-detail', \{ pointId: item\.left\.id \}\)/);
  assert.match(duplicates, /onNavigate\('point-detail', \{ pointId: item\.right\.id \}\)/,
    'both duplicate candidates must remain independently inspectable');
  assert.match(timeline, /onNavigate\('point-detail', \{ pointId: timeline\.point\.id, detailTab: 'timeline' \}\)/,
    'timeline must preserve the selected point and land on its timeline detail tab');
  assert.match(operations, /onNavigate\('point-detail', \{ pointId: point\.id, detailTab: setupDetailTab\(reason\) \}\)/,
    'setup-pending reasons must route to the actionable tab of the same point');
});

test('point detail provides one context-preserving route back to points for every entry point', () => {
  const detail = source('point-detail-page.tsx');

  assert.match(detail, /const returnToPoints = \(\) => onNavigate\('points', \{ query: location\.query, status: location\.status, region: location\.region, maintenanceType: location\.maintenanceType, page: location\.page, scrollY: location\.scrollY \}\)/,
    'the return route must retain query, status, region, maintenance type, page, and scroll');
  assert.doesNotMatch(detail, /onNavigate\('points', \{ query: location\.query, status: location\.status, page: location\.page, scrollY: location\.scrollY \}\)/,
    'no header return path may silently discard region or maintenance type');
});
