import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const path = new URL('./point-detail-page.tsx', import.meta.url);
test('point detail stays read only until explicit edit mode', () => {
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /useState\(false\)/);
  assert.match(source, /Düzenle/);
  assert.match(source, /Kaydet/);
  assert.match(source, /İptal/);
  assert.match(source, /method: 'PATCH'/);
});
