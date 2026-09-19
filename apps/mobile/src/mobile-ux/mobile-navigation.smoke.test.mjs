import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shellFile = new URL('./MobileShell.tsx', import.meta.url);

test('primary navigation contains exactly the three technician destinations', () => {
  assert.ok(fs.existsSync(shellFile), 'mobile shell must exist');
  const source = fs.readFileSync(shellFile, 'utf8');

  const destinations = [...source.matchAll(/destination: '[^']+', label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(destinations, ['İşler', 'Müşterilerim', 'Geçmiş']);
  for (const legacyDestination of ['Yakınımdakiler', 'Yardım Et', 'Yeni Nokta', 'EFESİM', 'Harita', 'Help']) {
    assert.equal(destinations.includes(legacyDestination), false, `${legacyDestination} must not be primary navigation`);
  }
});

test('the header keeps sign-out in a compact account action', () => {
  const source = fs.readFileSync(shellFile, 'utf8');

  assert.match(source, /accessibilityLabel="Hesap seçeneklerini aç"/);
  assert.match(source, /onProfilePress/);
  assert.doesNotMatch(source, />ÇIKIŞ</);
});

test('account surface owns identity, version, and sign-out', () => {
  const source = fs.readFileSync(new URL('../CorporateApp.tsx', import.meta.url), 'utf8');

  assert.match(source, /Alert\.alert\('Hesap', `\$\{user\?\.name \?\? ''\}\\nfıçıbakım v1\.1`/);
  assert.match(source, /text: 'Çıkış yap'/);
});

test('child flows can hide the three-destination navigation', () => {
  const source = fs.readFileSync(shellFile, 'utf8');

  assert.match(source, /showNavigation/);
  assert.match(source, /showNavigation && <View accessibilityRole="tablist"/);
});
