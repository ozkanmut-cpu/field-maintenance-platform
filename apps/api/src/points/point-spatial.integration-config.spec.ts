import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { requirePostgisTestDatabaseUrl } from './point-spatial.integration-config';

test('PostGIS integration database guard rejects missing and unsafe URLs', () => {
  const unsafeUrls = [
    undefined,
    '',
    'not-a-url',
    'https://localhost/field_maintenance_test',
    'postgresql://field_maintenance:local@localhost/field_maintenance',
    'postgresql://field_maintenance:local@localhost/field_maintenance_test_backup',
  ];

  for (const url of unsafeUrls) {
    assert.throws(
      () => requirePostgisTestDatabaseUrl(url),
      /POSTGIS_TEST_DATABASE_URL.*field_maintenance_test/,
    );
  }
});

test('PostGIS integration database guard accepts only the dedicated test database', () => {
  const url =
    'postgresql://field_maintenance:local-ci-only@127.0.0.1:5432/field_maintenance_test';

  assert.equal(requirePostgisTestDatabaseUrl(url), url);
});
