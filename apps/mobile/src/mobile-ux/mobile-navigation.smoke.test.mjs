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

test('the header exposes token deletion as an explicit sign-out action', () => {
  const source = fs.readFileSync(shellFile, 'utf8');

  assert.match(source, /accessibilityLabel="Oturumu kapat"/);
  assert.match(source, />ÇIKIŞ</);
  assert.doesNotMatch(source, />PROFİL</);
  assert.doesNotMatch(source, /onProfilePress/);
});
