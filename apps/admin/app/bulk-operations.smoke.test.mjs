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
  assert.doesNotMatch(source, /canonicalLatitude|canonicalLongitude|googlePlaceId|locationSource|locationConfidence/);
});
