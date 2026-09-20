import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { DEMO_DATASET, demoUsername, isDemoEntityName, purgeOrder, showcaseCoverage } from './demo-data-plan';

test('showcase dataset has a believable visible identity and enough screen coverage', () => {
  assert.equal(DEMO_DATASET.regionName, 'Kordon Operasyon Bölgesi');
  assert.equal(demoUsername('technician'), 'ozge.kaya');
  assert.equal(demoUsername('helper'), 'can.durmaz');
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

test('demo commands use the API ts-node runner instead of Node direct TypeScript execution', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.match(pkg.scripts['demo:seed'], /^set -a; \. \.\.\/\.\.\/\.env; set \+a; ts-node --compiler-options /);
  assert.match(pkg.scripts['demo:purge'], /^set -a; \. \.\.\/\.\.\/\.env; set \+a; ts-node --compiler-options /);
});
