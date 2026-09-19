import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const presentationFile = new URL('./task-detail-presentation.ts', import.meta.url);

function loadPresentation() {
  assert.ok(fs.existsSync(presentationFile), 'task detail presentation helper must exist');
  const source = fs.readFileSync(presentationFile, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('formats date-only and dashboard ISO due dates without invalid-date text', () => {
  const { formatTaskDueDate } = loadPresentation();

  for (const value of ['2026-09-14', '2026-09-14T00:00:00.000Z']) {
    const formatted = formatTaskDueDate(value);
    assert.match(formatted, /^14\s/);
    assert.doesNotMatch(formatted, /Invalid Date/i);
  }
});
