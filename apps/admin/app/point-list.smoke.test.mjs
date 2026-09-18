import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const pointListPath = new URL('./point-list.tsx', import.meta.url);

test('point list is a read-only finding surface', () => {
  assert.equal(existsSync(pointListPath), true);
  const source = readFileSync(pointListPath, 'utf8');
  assert.match(source, /Detay/);
  assert.match(source, /Toplu İşlemler/);
  assert.doesNotMatch(source, /method: 'PATCH'/);
  assert.doesNotMatch(source, /bulk-update/);
  assert.doesNotMatch(source, /onChange=.*point\.status/);
});
