import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appFile = new URL('../CorporateApp.tsx', import.meta.url);

test('login starts directly with credentials and has no marketing introduction', () => {
  const source = fs.readFileSync(appFile, 'utf8');

  assert.doesNotMatch(source, /fıçıbakım’a hoş geldin/);
  assert.doesNotMatch(source, /Daha iyi servis, daha iyi bira/);
  assert.match(source, /<Text style={styles\.formLabel}>KULLANICI ADI<\/Text>/);
  assert.match(source, /<Text style={styles\.formLabel}>ŞİFRE<\/Text>/);
});
