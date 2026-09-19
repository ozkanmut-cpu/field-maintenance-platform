import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const timeline = readFileSync(new URL('./point-timeline.tsx', import.meta.url), 'utf8');
const prospects = readFileSync(new URL('./prospects.tsx', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../../.github/workflows/reporting-ci.yml', import.meta.url), 'utf8');

test('timeline preserves the selected point and opens its timeline detail tab', () => {
  assert.match(timeline, /maintenance\/point-timeline\?pointId=\$\{encodeURIComponent\(id\)\}/);
  assert.match(timeline, /onNavigate\('point-detail', \{ pointId: timeline\.point\.id, detailTab: 'timeline' \}\)/);
});

test('prospect conversion and history both open the resulting real point detail', () => {
  assert.match(prospects, /onNavigate\('point-detail', \{ pointId: result\.point\.id, detailTab: 'general' \}\)/);
  assert.match(prospects, /onNavigate\('point-detail', \{ pointId: convertedPoint\.id, detailTab: 'general' \}\)/);
});

test('Reporting CI directly covers point timeline and prospect navigation sources and smoke', () => {
  for (const path of [
    'apps/admin/app/point-timeline.tsx',
    'apps/admin/app/prospects.tsx',
    'apps/admin/app/point-navigation-coverage.smoke.test.mjs',
  ]) {
    assert.match(workflow, new RegExp(`- '${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(workflow, /Reporting admin smoke[\s\S]*apps\/admin\/app\/point-navigation-coverage\.smoke\.test\.mjs/);
});
