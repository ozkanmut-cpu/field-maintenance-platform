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

test('back does not replace Android system behavior from the Jobs root', () => {
  const { popScreen } = loadNavigation();
  assert.equal(popScreen([], 'TASKS'), null);
});