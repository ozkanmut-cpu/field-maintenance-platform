const REQUIRED_DATABASE_NAME = 'field_maintenance_test';

export function requirePostgisTestDatabaseUrl(value: string | undefined): string {
  const unsafeUrl = () =>
    new Error(
      `POSTGIS_TEST_DATABASE_URL must be a PostgreSQL URL targeting ${REQUIRED_DATABASE_NAME}`,
    );

  if (!value) throw unsafeUrl();

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw unsafeUrl();
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw unsafeUrl();
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw unsafeUrl();
  }
  if (databaseName !== REQUIRED_DATABASE_NAME) throw unsafeUrl();

  return value;
}
