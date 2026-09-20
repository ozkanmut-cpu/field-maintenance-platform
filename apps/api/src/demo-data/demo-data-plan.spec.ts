import * as assert from 'node:assert/strict';
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
