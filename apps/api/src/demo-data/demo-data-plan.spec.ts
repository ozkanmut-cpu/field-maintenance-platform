import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { DEMO_DATASET, demoUsername, isDemoEntityName, purgeOrder, showcaseCoverage } from './demo-data-plan';
import * as mockupPlan from './demo-data-plan';

test('showcase dataset has a believable visible identity and enough screen coverage', () => {
  assert.equal(DEMO_DATASET.regionName, 'Kordon Operasyon Bölgesi');
  assert.equal(demoUsername('technician'), 'mockup.ozge.kaya');
  assert.equal(demoUsername('helper'), 'mockup.can.durmaz');
  assert.equal(isDemoEntityName('Kordon Operasyon Bölgesi'), true);
  assert.equal(isDemoEntityName('Gerçek Müşteri'), false);
  assert.ok(showcaseCoverage.pointCount >= 10);
  assert.ok(showcaseCoverage.maintenanceVisits >= 6);
  assert.deepEqual([...showcaseCoverage.paperworkStates].sort(), ['APPROVED', 'MISSING', 'PENDING', 'PENDING_REVIEW', 'PRESENT']);
  assert.ok(showcaseCoverage.includesPartialMaintenance);
  assert.ok(showcaseCoverage.includesPastDatedMaintenance);
  assert.ok(showcaseCoverage.includesLocationReview);
});

test('purge removes dependent records before demo users and region', () => {
  assert.ok(purgeOrder.indexOf('paperworkStatusHistory') < purgeOrder.indexOf('maintenanceVisit'));
  assert.ok(purgeOrder.indexOf('maintenanceVisit') < purgeOrder.indexOf('point'));
  assert.ok(purgeOrder.indexOf('point') < purgeOrder.indexOf('region'));
  assert.ok(purgeOrder.indexOf('region') < purgeOrder.indexOf('user'));
});

test('mockup commands use the API ts-node runner without loading ambient runtime configuration', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.match(pkg.scripts['mockup:reset'], /^ts-node --compiler-options .+ src\/demo-data\/demo-data\.cli\.ts reset$/);
  assert.match(pkg.scripts['mockup:purge'], /^ts-node --compiler-options .+ src\/demo-data\/demo-data\.cli\.ts purge$/);
  assert.equal(pkg.scripts['mockup:reset'].includes('.env'), false);
  assert.equal(pkg.scripts['mockup:purge'].includes('.env'), false);
});

test('mockup CLI rejects a production runtime before database work begins', () => {
  const result = spawnSync('npm', ['run', 'mockup:reset'], {
    cwd: resolve(__dirname, '../..'), encoding: 'utf8',
    env: { PATH: process.env.PATH, MOCKUP_DATASET: 'mobile-evidence', NODE_ENV: 'production', DATABASE_URL: 'postgresql://mock:mock@127.0.0.1:5432/field_maintenance_mockup' },
  });
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /production/i);
});

test('mockup reset requires an explicit local non-production database and returns only named scope', () => {
  const build = Reflect.get(mockupPlan, 'buildMockupResetPlan');
  assert.equal(typeof build, 'function');
  const reset = (build as (environment: Record<string, string>) => { action: string; databaseName: string; scope: { usernames: readonly string[]; regionName: string } })({
    MOCKUP_DATASET: 'mobile-evidence', NODE_ENV: 'test', DATABASE_URL: 'postgresql://mock:mock@127.0.0.1:5432/field_maintenance_mockup',
  });
  assert.deepEqual(reset, {
    action: 'reset', databaseName: 'field_maintenance_mockup',
    scope: { regionName: 'Kordon Operasyon Bölgesi', usernames: ['mockup.ozge.kaya', 'mockup.can.durmaz'] },
  });
  assert.throws(() => (build as (environment: Record<string, string>) => unknown)({
    MOCKUP_DATASET: 'mobile-evidence', NODE_ENV: 'production', DATABASE_URL: 'postgresql://mock:mock@127.0.0.1:5432/field_maintenance_mockup',
  }), /production/i);
  assert.throws(() => (build as (environment: Record<string, string>) => unknown)({
    MOCKUP_DATASET: 'mobile-evidence', NODE_ENV: 'test', DATABASE_URL: 'postgresql://mock:mock@srv.field-maintenance-prod.com:5432/field_maintenance_mockup',
  }), /local/i);
});

test('mockup reset is idempotent and leaves non-mockup records untouched', async () => {
  const execute = Reflect.get(mockupPlan, 'resetMockupDataset');
  assert.equal(typeof execute, 'function');
  const records = new Set(['operational-point']);
  const operations = {
    purge: async () => { records.delete('mockup-region'); records.delete('mockup-help'); return { removed: 2 }; },
    seed: async () => { records.add('mockup-region'); records.add('mockup-help'); return { created: 2 }; },
  };
  const reset = execute as (handlers: typeof operations) => Promise<{ purged: { removed: number }; seeded: { created: number } }>;
  const first = await reset(operations);
  const firstSnapshot = [...records].sort();
  const second = await reset(operations);
  assert.deepEqual(first, { purged: { removed: 2 }, seeded: { created: 2 } });
  assert.deepEqual(second, first);
  assert.deepEqual([...records].sort(), firstSnapshot);
  assert.deepEqual(firstSnapshot, ['mockup-help', 'mockup-region', 'operational-point']);
});

test('mockup labels, help authority, and evidence fixture states are natural and complete', () => {
  const profile = Reflect.get(mockupPlan, 'mockupEvidenceProfile') as {
    visibleLabels: readonly string[];
    help: { helperName: string; targetName: string };
    flows: Readonly<Record<string, { pointCode?: string; userVisibleOutcome: string }>>;
  } | undefined;
  assert.ok(profile);
  assert.equal(profile.help.helperName, 'Can Durmaz');
  assert.equal(profile.help.targetName, 'Özge Kaya');
  assert.ok(profile.visibleLabels.every((label) => !/demo/i.test(label)));
  assert.deepEqual(Object.keys(profile.flows).sort(), [
    'failedMaintenance', 'help', 'locationDecision', 'nonMaintenanceCustomer', 'nonMaintenanceNoCustomerFallback',
    'paperworkReview', 'partialMaintenance', 'pastDatedMaintenance',
  ]);
  assert.equal(profile.flows.partialMaintenance.userVisibleOutcome, '4/5 soğutucu bakım · 1 eksik');
  assert.equal((profile.flows.partialMaintenance as { obligationStatus?: string }).obligationStatus, 'COMPLETED');
  assert.equal(profile.flows.nonMaintenanceNoCustomerFallback.userVisibleOutcome, 'Açıklama ile ziyaret kaydedildi');
});
