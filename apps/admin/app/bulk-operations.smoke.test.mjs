import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const path = new URL('./bulk-operations.tsx', import.meta.url);

function loadStateHelper(name) {
  const source = readFileSync(path, 'utf8');
  const marker = `export ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must be available for behavioral testing`);
  const end = source.indexOf('\n\n', start);
  assert.notEqual(end, -1, `${name} must end before the component`);
  const helper = source.slice(start, end)
    .replace('export ', '')
    .replace(/: \(\) => Promise<void>/g, '')
    .replace(/: \(\) => void/g, '')
    .replace(/\): Promise<boolean>/, ')');
  return Function(`${helper}; return ${name.split(' ').at(-1)};`)();
}

test('filter changes discard a confirmed selection instead of retaining hidden targets', () => {
  const invalidateForFilterChange = loadStateHelper('function invalidateForFilterChange');
  const state = invalidateForFilterChange();
  assert.deepEqual(state.selected, []);
  assert.equal(state.preview, false);
  assert.equal(state.confirmed, false);
});

test('a refresh failure after a successful mutation cannot leave it retryable', async () => {
  const completeBulkMutation = loadStateHelper('async function completeBulkMutation');
  const events = [];
  await completeBulkMutation(
    async () => events.push('mutate'),
    () => events.push('reset'),
    async () => { throw new Error('refresh failed'); },
    () => events.push('warn'),
  );
  assert.deepEqual(events, ['mutate', 'reset', 'warn']);
});

test('bulk mutation helper has strict TypeScript callback and return types', () => {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /async function completeBulkMutation\([\s\S]*mutate: \(\) => Promise<void>[\s\S]*reset: \(\) => void[\s\S]*reload: \(\) => Promise<void>[\s\S]*warn: \(\) => void[\s\S]*\): Promise<boolean>/);
});

test('both target discovery controls use the selection invalidation path', () => {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /function changeFilter[\s\S]*invalidateForFilterChange\(\)/);
  assert.match(source, /onChange=\{\(event\) => changeFilter\(\(\) => setQuery/);
  assert.match(source, /onChange=\{\(event\) => changeFilter\(\(\) => setStatusFilter/);
});

test('bulk operations require preview and explicit confirmation', () => {
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /Değişiklikleri Önizle/);
  assert.match(source, /Uygulamayı Onayla/);
  assert.match(source, /SET_REGION/);
  assert.match(source, /const \[query, setQuery\]/, 'targets must be searchable using the supported point-list search');
  assert.match(source, /const \[statusFilter, setStatusFilter\]/, 'targets must be filterable by the supported status filter');
  assert.match(source, /const visible = useMemo/, 'the table must render the filtered target set');
  assert.match(source, /visible\.map\(\(point\)/, 'only discoverable targets may be selected');
  assert.match(source, /completeBulkMutation/, 'successful updates must reload current point data');
  assert.doesNotMatch(source, /canonicalLatitude|canonicalLongitude|googlePlaceId|locationSource|locationConfidence/);
});

test('bulk operations use the real bulk update contract and keep region payloads location-free', () => {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /fetch\('\/api\/backend\/points\/bulk-update'/);
  assert.doesNotMatch(source, /\/api\/backend\/points\/bulk-preview/);
  assert.match(source, /if \(action === 'SET_REGION'\) payload\.regionId = regionId;/);
  assert.doesNotMatch(source, /payload\.(?:canonicalLatitude|canonicalLongitude|googlePlaceId|locationSource|locationConfidence)/);
});