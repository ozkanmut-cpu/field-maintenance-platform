import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const path = new URL('./bulk-operations.tsx', import.meta.url);
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
  assert.match(source, /await loadPoints\(\)/, 'successful updates must reload current point data');
  assert.doesNotMatch(source, /canonicalLatitude|canonicalLongitude|googlePlaceId|locationSource|locationConfidence/);
});

test('bulk operations use the real bulk update contract and keep region payloads location-free', () => {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /fetch\('\/api\/backend\/points\/bulk-update'/);
  assert.doesNotMatch(source, /\/api\/backend\/points\/bulk-preview/);
  assert.match(source, /if \(action === 'SET_REGION'\) payload\.regionId = regionId;/);
  assert.doesNotMatch(source, /payload\.(?:canonicalLatitude|canonicalLongitude|googlePlaceId|locationSource|locationConfidence)/);
});
