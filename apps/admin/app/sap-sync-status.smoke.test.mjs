import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function panel() {
  const filename = new URL('./sap-sync-status.tsx', import.meta.url);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports;
}

const baseRun = { at: '2026-09-19T08:00:00.000Z', rows: 11, inserted: 2, updated: 3, unchanged: 4, deleted: 1, blockedDeletes: 5, oldest: '2026-09-01', newest: '2026-09-19', guard: ['minimum rows not met', 'source snapshot incomplete'] };

test('SAP sync status displays outcome, unchanged records, blocked deletes and guard reasons', () => {
  const { SapSyncStatusDetails } = panel();
  const html = renderToStaticMarkup(React.createElement(SapSyncStatusDetails, { sync: { ...baseRun, status: 'PARTIAL' } }));
  for (const label of ['PARTIAL', 'Değişmedi', 'Engellenen silme', 'Silme koruması nedenleri', 'minimum rows not met', 'source snapshot incomplete']) assert.ok(html.includes(label), label);
  assert.ok(html.includes('2 / 3 / 4'), 'inserted / updated / unchanged counts are shown');
  assert.ok(html.includes('1 / 5'), 'deleted / blocked delete counts are shown');
});

test('lowercase success from the SAP audit producer is called the last successful run', () => {
  const { SapSyncStatusDetails } = panel();
  const success = renderToStaticMarkup(React.createElement(SapSyncStatusDetails, { sync: { ...baseRun, status: 'success' } }));
  const failed = renderToStaticMarkup(React.createElement(SapSyncStatusDetails, { sync: { ...baseRun, status: 'FAILED' } }));
  assert.ok(success.includes('Son başarılı çalışma'));
  assert.equal(failed.includes('Son başarılı çalışma'), false);
  assert.ok(failed.includes('Son çalışma'));
});