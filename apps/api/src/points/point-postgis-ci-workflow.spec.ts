import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const workflowPath = resolve(process.cwd(), '.github/workflows/postgis-ci.yml');
const apiPackagePath = resolve(process.cwd(), 'apps/api/package.json');

test('PostGIS CI uses an ephemeral service and verifies deployed migrations before integration tests', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  const apiPackage = JSON.parse(readFileSync(apiPackagePath, 'utf8')) as {
    scripts?: Record<string, string>;
  };

  assert.doesNotMatch(workflow, /\n\s+paths:/);
  assert.doesNotMatch(workflow, /pull_request:\n\s+branches:/);
  assert.match(workflow, /image: postgis\/postgis:16-3\.4/);
  assert.match(workflow, /POSTGRES_HOST_AUTH_METHOD: trust/);
  assert.match(workflow, /pg_isready -U postgres -d field_maintenance_test/);
  assert.doesNotMatch(workflow, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(workflow, /POSTGRES_PASSWORD:/);

  const deploy = workflow.indexOf('prisma:deploy');
  const status = workflow.indexOf('prisma:status');
  const integration = workflow.indexOf('Real PostGIS integration');

  assert.ok(deploy >= 0, 'PostGIS CI must deploy migrations');
  assert.ok(status > deploy, 'PostGIS CI must check migration status after deployment');
  assert.ok(integration > status, 'PostGIS integration tests must run after migration status');
  assert.equal(apiPackage.scripts?.['prisma:status'], 'prisma migrate status');
  assert.match(workflow, /POSTGIS_TEST_DATABASE_URL="\$DATABASE_URL"/);
});
