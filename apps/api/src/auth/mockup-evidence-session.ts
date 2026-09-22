export type MockupEvidenceEnvironment = Readonly<Record<string, string | undefined>>;

const localDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1']);

export function isMockupEvidenceSessionEnabled(env: MockupEvidenceEnvironment): boolean {
  if (env.NODE_ENV !== 'test') return false;
  if (env.MOCKUP_DATASET !== 'mobile-evidence') return false;
  if (env.MOCKUP_EVIDENCE_SESSION !== 'enabled') return false;

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) return false;
  try {
    const database = new URL(databaseUrl);
    const databaseName = decodeURIComponent(database.pathname).replace(/^\//, '');
    return localDatabaseHosts.has(database.hostname) && /_(mockup|test)$/.test(databaseName);
  } catch {
    return false;
  }
}
