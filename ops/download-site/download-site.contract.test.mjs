import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('.', import.meta.url);

test('download page identifies the published b7b2c038 Android build', async () => {
  const page = await readFile(new URL('index.html', root), 'utf8');
  assert.match(page, /b7b2c038/);
  assert.match(page, /c8b0439190e350968b7dedd22c4f013b111c5900dfd501865a1c7f14c2d8ef03/);
  assert.match(page, /\/downloads\/fici-bakim\.apk/);
  assert.match(page, /\/kilavuz/);
});

test('guide covers every released technician workflow', async () => {
  const guide = await readFile(new URL('kilavuz.html', root), 'utf8');
  for (const heading of [
    'İşler', 'Müşterilerim', 'Geçmiş', 'Bakım tarihi', 'Kısmi bakım',
    'Eksik evraklar', 'Bakım dışı ziyaret', 'Geri al',
  ]) assert.match(guide, new RegExp(heading));
});
