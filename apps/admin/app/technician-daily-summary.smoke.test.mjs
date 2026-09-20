import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function panel() {
  const filename = new URL('./technician-daily-summary.tsx', import.meta.url);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports;
}

const older = { technician: { name: 'Eski seçim' }, date: '2026-09-18', metrics: {}, paperwork: {}, events: [] };
const newer = { technician: { name: 'Yeni seçim' }, date: '2026-09-19', metrics: {}, paperwork: {}, events: [] };

test('new technician summary selection keeps a late older response from replacing it', async () => {
  const { createTechnicianDailySummaryLoader } = panel();
  const summaries = [];
  const pending = [];
  const loader = createTechnicianDailySummaryLoader({
    summary: (value) => summaries.push(value), error: () => {}, loading: () => {},
  }, (_url, init) => new Promise((resolve) => pending.push({ resolve, signal: init.signal })));

  loader.load({ technicianId: 'old', date: '2026-09-18' });
  loader.load({ technicianId: 'new', date: '2026-09-19' });
  assert.equal(pending[0].signal.aborted, true);

  pending[1].resolve({ ok: true, status: 200, json: async () => newer });
  await new Promise((resolve) => setImmediate(resolve));
  pending[0].resolve({ ok: true, status: 200, json: async () => older });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(summaries.filter(Boolean), [newer]);
});

test('late errors from an older technician summary request remain hidden', async () => {
  const { createTechnicianDailySummaryLoader } = panel();
  const errors = [];
  const pending = [];
  const loader = createTechnicianDailySummaryLoader({
    summary: () => {}, error: (value) => errors.push(value), loading: () => {},
  }, () => new Promise((resolve) => pending.push(resolve)));

  loader.load({ technicianId: 'old', date: '2026-09-18' });
  loader.load({ technicianId: 'new', date: '2026-09-19' });
  pending[1]({ ok: true, status: 200, json: async () => newer });
  await new Promise((resolve) => setImmediate(resolve));
  const beforeLateError = errors.slice();
  pending[0]({ ok: false, status: 500, json: async () => ({ message: 'Eski hata' }) });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(errors, beforeLateError);
});

test('technician summary uses semantic table headers and announces failures', () => {
  const source = fs.readFileSync(new URL('./technician-daily-summary.tsx', import.meta.url), 'utf8');
  for (const header of ['Evrak', 'Hareket']) assert.match(source, new RegExp(`<th scope="col">${header}</th>`));
  assert.match(source, /<th scope="row"><strong>Servis fişi<\/strong><\/th>/);
  assert.match(source, /className="error" role="alert"/);
  assert.doesNotMatch(source, /<caption/);
});

test('technician summary renders APPROVED paperwork counts in a dedicated column', () => {
  const { PaperworkSummaryTable } = panel();
  const summary = {
    technician: { name: 'Ali' },
    date: '2026-09-20',
    metrics: {
      completedMaintenance: 1, attemptCount: 0, nonMaintenanceVisitCount: 0, prospectVisitCount: 0,
      currentOpen: 0, overdueOpen: 0, helpedMaintenance: 0, helpedAttempts: 0,
      receivedHelpMaintenance: 0, receivedHelpAttempts: 0,
    },
    paperwork: {
      serviceSlip: { pending: 1, present: 2, missing: 3, approved: 7 },
      confirmation: { pending: 4, present: 5, missing: 6, approved: 8 },
    },
    events: [],
  };
  const html = renderToStaticMarkup(React.createElement(PaperworkSummaryTable, { paperwork: summary.paperwork }));
  assert.match(html, /<th scope="col">Onaylandı<\/th>/);
  assert.match(html, /<th scope="row"><strong>Servis fişi<\/strong><\/th><td>1<\/td><td>2<\/td><td>3<\/td><td>7<\/td>/);
  assert.match(html, /<th scope="row"><strong>Teyit<\/strong><\/th><td>4<\/td><td>5<\/td><td>6<\/td><td>8<\/td>/);
});
