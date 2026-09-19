import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('./hardware-back.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);

test('hardware back only returns from a child flow to its immediate parent destination', () => {
  const { previousTechnicianScreen } = mod.exports;

  assert.equal(previousTechnicianScreen('EQUIPMENT_CONFIRM'), 'TASK_DETAIL');
  assert.equal(previousTechnicianScreen('ATTEMPT'), 'TASK_DETAIL');
  assert.equal(previousTechnicianScreen('TASK_DETAIL'), 'TASKS');
  assert.equal(previousTechnicianScreen('CUSTOMER'), 'CUSTOMERS');
  assert.equal(previousTechnicianScreen('HISTORY'), null);
  assert.equal(previousTechnicianScreen('TASKS'), null);
});
