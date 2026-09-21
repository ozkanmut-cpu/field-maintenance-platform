import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./maintenance-date.ts', import.meta.url);

function loadPolicy() {
  assert.ok(fs.existsSync(filename), 'mobile maintenance date policy must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('defaults to today and starts at Monday of the previous week', () => {
  const { maintenanceDateBounds } = loadPolicy();
  assert.deepEqual(maintenanceDateBounds('2026-09-19'), {
    selectedDateKey: '2026-09-19',
    minimumDateKey: '2026-09-07',
    maximumDateKey: '2026-09-19',
  });
});

test('calendar disables future and pre-range dates', () => {
  const { buildMaintenanceCalendarDays } = loadPolicy();
  const days = buildMaintenanceCalendarDays('2026-09-19');
  assert.equal(days.find((day) => day.dateKey === '2026-09-06').disabled, true);
  assert.equal(days.find((day) => day.dateKey === '2026-09-07').disabled, false);
  assert.equal(days.find((day) => day.dateKey === '2026-09-19').disabled, false);
  assert.equal(days.find((day) => day.dateKey === '2026-09-20').disabled, true);
});
