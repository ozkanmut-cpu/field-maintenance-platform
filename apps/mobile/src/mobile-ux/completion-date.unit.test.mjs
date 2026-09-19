import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const file = new URL('./completion-date.ts', import.meta.url);

function loadCompletionDate() {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('completion defaults to today and accepts dates from last Monday through today', () => {
  const { completionDateBounds, isAllowedCompletionDate } = loadCompletionDate();
  const now = new Date('2026-09-19T09:00:00.000Z');
  const bounds = completionDateBounds(now);

  assert.deepEqual(bounds, { min: '2026-09-07', max: '2026-09-19' });
  assert.equal(isAllowedCompletionDate('2026-09-07', now), true);
  assert.equal(isAllowedCompletionDate('2026-09-19', now), true);
  assert.equal(isAllowedCompletionDate('2026-09-06', now), false);
  assert.equal(isAllowedCompletionDate('2026-09-20', now), false);
});
