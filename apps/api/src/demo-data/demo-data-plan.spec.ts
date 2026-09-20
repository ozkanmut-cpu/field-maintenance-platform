import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { DEMO_DATASET, demoUsername, isDemoEntityName, purgeOrder } from './demo-data-plan';

test('demo dataset has a unique, visible identity', () => {
  assert.equal(DEMO_DATASET.regionName, '__DEMO__ Mobil ve Admin Önizleme');
  assert.equal(demoUsername('technician'), 'demo-teknisyen');
  assert.equal(isDemoEntityName('DEMO — Eksik Evrak'), true);
  assert.equal(isDemoEntityName('Gerçek Müşteri'), false);
});

test('purge removes dependent records before demo users and region', () => {
  assert.ok(purgeOrder.indexOf('paperworkStatusHistory') < purgeOrder.indexOf('maintenanceVisit'));
  assert.ok(purgeOrder.indexOf('maintenanceVisit') < purgeOrder.indexOf('point'));
  assert.ok(purgeOrder.indexOf('point') < purgeOrder.indexOf('region'));
  assert.ok(purgeOrder.indexOf('region') < purgeOrder.indexOf('user'));
});

test('demo commands use the API ts-node runner instead of Node direct TypeScript execution', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.match(pkg.scripts['demo:seed'], /^ts-node --compiler-options /);
  assert.match(pkg.scripts['demo:purge'], /^ts-node --compiler-options /);
});
