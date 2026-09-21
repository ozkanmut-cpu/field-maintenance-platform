import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./mobile-navigation.ts', import.meta.url);

function loadNavigation() {
  assert.ok(fs.existsSync(filename), 'mobile navigation helper must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('primary navigation exposes only Jobs, Customers and History', () => {
  const { primaryTabs } = loadNavigation();
  assert.deepEqual(primaryTabs.map((tab) => tab.screen), ['TASKS', 'CUSTOMERS', 'HISTORY']);
  assert.deepEqual(primaryTabs.map((tab) => tab.label), ['İşler', 'Müşterilerim', 'Geçmiş']);
});

test('back returns to the immediately preceding mobile screen', () => {
  const { pushScreen, popScreen } = loadNavigation();
  const history = pushScreen([], 'TASKS', 'CUSTOMERS');
  assert.deepEqual(popScreen(history, 'CUSTOMERS'), { screen: 'TASKS', history: [] });
});

test('back from the Help flow returns to Jobs rather than treating Help as a tab', () => {
  const { pushScreen, popScreen } = loadNavigation();
  const history = pushScreen([], 'TASKS', 'HELP');
  assert.deepEqual(popScreen(history, 'HELP'), { screen: 'TASKS', history: [] });
});

test('back from missing paperwork returns to Jobs without adding a primary tab', () => {
  const { pushScreen, popScreen, primaryTabs } = loadNavigation();
  const source = fs.readFileSync(filename, 'utf8');
  assert.match(source, /\| 'MISSING_ITEMS'/);
  const history = pushScreen([], 'TASKS', 'MISSING_ITEMS');
  assert.deepEqual(popScreen(history, 'MISSING_ITEMS'), { screen: 'TASKS', history: [] });
  assert.equal(primaryTabs.some((tab) => tab.screen === 'MISSING_ITEMS'), false);
});

test('Android back dismisses the attempted-maintenance reason modal without selecting a reason', () => {
  const { resolveHardwareBack } = loadNavigation();
  assert.deepEqual(resolveHardwareBack('ATTEMPT_REASON', [], 'TASKS'), {
    type: 'DISMISS_DIALOG',
    dialog: 'ATTEMPT_REASON',
  });
});

test('Android back dismisses the location confirmation modal without choosing a completion path', () => {
  const { resolveHardwareBack } = loadNavigation();
  assert.deepEqual(resolveHardwareBack('LOCATION_CONFIRMATION', ['TASKS'], 'EQUIPMENT_CONFIRM'), {
    type: 'DISMISS_DIALOG',
    dialog: 'LOCATION_CONFIRMATION',
  });
});

test('Android back from the maintenance form returns directly to Jobs', () => {
  const { resolveHardwareBack } = loadNavigation();
  assert.deepEqual(resolveHardwareBack(null, ['TASKS', 'HELP'], 'EQUIPMENT_CONFIRM'), {
    type: 'NAVIGATE',
    screen: 'TASKS',
    history: [],
  });
});

test('Android back is consumed at the Jobs root instead of exiting the app', () => {
  const { resolveHardwareBack } = loadNavigation();
  assert.deepEqual(resolveHardwareBack(null, [], 'TASKS'), { type: 'STAY' });
});