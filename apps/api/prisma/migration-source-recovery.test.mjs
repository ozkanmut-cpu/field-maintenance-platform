import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migrations = [
  ['20260913043500_google_estimated_location_source', '15d6f0ee10b424ce5e2aa2eaa83bf7c9b30efed2a9f3a294c84d1a101d0d286c'],
  ['20260913123500_visit_site_presence', 'e445923201f5259ede65b38fc215883bc43f5f4f08d4f8c349dde0f88fe85ee0'],
];

test('recovered production migrations retain their applied database checksums', () => {
  for (const [migration, checksum] of migrations) {
    const source = readFileSync(new URL(`./migrations/${migration}/migration.sql`, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), checksum, migration);
  }
});
