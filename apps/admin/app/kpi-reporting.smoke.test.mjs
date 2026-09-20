import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function panel() {
  const filename = new URL('./kpi-reporting.tsx', import.meta.url);
  assert.ok(fs.existsSync(filename), 'KPI panel must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports;
}
const counts = { completedMaintenance: 2, ownMaintenance: 1, attemptCount: 1, successRate: 66.7,
  nonMaintenanceVisitCount: 0, prospectVisitCount: 1, enteredLate: 1,
  helpedMaintenance: 1, helpedAttempts: 0, receivedHelpMaintenance: 1, receivedHelpAttempts: 0,
  currentOpen: 3, overdueOpen: 2, unassignedOpen: 1 };
const report = { from: '2026-09-15', to: '2026-09-16', metrics: counts,
  paperwork: { serviceSlip: { pending: 1, present: 1, missing: 0, approved: 7 }, confirmation: { pending: 0, present: 1, missing: 1, approved: 8 } },
  daily: [{ date: '2026-09-15', ...counts }], technicians: [{ technicianId: 't1', name: 'Ali', ...counts }] };

test('KPI report renders metrics, help separation, paperwork, daily trend and technicians', () => {
  const { KpiReportView } = panel();
  const html = renderToStaticMarkup(React.createElement(KpiReportView, { report }));
  for (const label of ['66,7', 'Yardım verdi', 'Yardım aldı', 'Servis fişi', 'Teyit', '2026-09-15', 'Ali', 'Atamasız']) assert.ok(html.includes(label), label);
});

test('KPI report keeps table headers and row labels semantic without duplicating shell captions', () => {
  const { KpiReportView } = panel();
  const html = renderToStaticMarkup(React.createElement(KpiReportView, { report }));
  assert.match(html, /<th scope="col">Evrak<\/th>/);
  assert.match(html, /<th scope="col">Onaylandı<\/th>/);
  assert.match(html, /<th scope="row"><strong>Servis fişi<\/strong><\/th><td>1<\/td><td>1<\/td><td>0<\/td><td>7<\/td>/);
  assert.match(html, /<th scope="row"><strong>Teyit<\/strong><\/th><td>0<\/td><td>1<\/td><td>1<\/td><td>8<\/td>/);
  assert.match(html, /<th scope="col">Günlük trend<\/th>/);
  assert.match(html, /<th scope="col">Teknisyen<\/th>/);
  assert.match(html, /<th scope="row"><strong>Servis fişi<\/strong><\/th>/);
  assert.doesNotMatch(html, /<caption/);
});

test('KPI failure is announced as an alert', () => {
  const source = fs.readFileSync(new URL('./kpi-reporting.tsx', import.meta.url), 'utf8');
  assert.match(source, /className="error" role="alert"/);
});
test('KPI error state does not fall through to the empty state and remains retryable', () => {
  const source = fs.readFileSync(new URL('./kpi-reporting.tsx', import.meta.url), 'utf8');
  assert.match(source, /error \? <><div className="error" role="alert">\{error\}<\/div><button className="ghost" onClick=\{\(\) => void refresh\(\)\}>Tekrar dene<\/button><\/>/);
  assert.match(source, /: report \?/);
});
test('KPI loader encodes filters and clears old report before response', async () => {
  const { startKpiRequest } = panel();
  const events = [];
  let url;
  const done = new Promise(resolve => {
    startKpiRequest({ from: '2026-09-15', to: '2026-09-16', technicianId: 'tech & 1' }, {
      report: r => events.push(r), error: e => events.push(e), loading: b => { if (!b) resolve(); },
    }, async u => { url = u; return { ok: true, json: async () => report }; });
  });
  await done;
  const params = new URL(url, 'http://localhost').searchParams;
  assert.equal(params.get('technicianId'), 'tech & 1');
  assert.equal(params.get('from'), '2026-09-15');
  assert.equal(params.get('to'), '2026-09-16');
  assert.equal(events[0], null);
  assert.equal(events.at(-1), report);
});
test('cancelled KPI requests cannot restore stale data or stale errors', async () => {
  const { startKpiRequest } = panel();
  for (const ok of [true, false]) {
    let resolve;
    const pending = new Promise(r => { resolve = r; });
    const values = [];
    const cancel = startKpiRequest({ from: '2026-09-15', to: '2026-09-16', technicianId: '' }, {
      report: r => values.push(r), error: e => values.push(e), loading: b => values.push(b),
    }, () => pending);
    cancel();
    const before = values.slice();
    resolve({ ok, status: 500, json: async () => ok ? report : { message: 'old error' } });
    await new Promise(r => setImmediate(r));
    assert.deepEqual(values, before);
  }
});
test('KPI loader surfaces HTTP failure without leaving stale results', async () => {
  const { startKpiRequest } = panel();
  const errors = [], values = [];
  await new Promise(resolve => startKpiRequest({ from: '2026-09-15', to: '2026-09-16', technicianId: '' }, {
    report: r => values.push(r), error: e => errors.push(e), loading: b => { if (!b) resolve(); },
  }, async () => ({ ok: false, status: 400, json: async () => ({ message: 'Geçersiz tarih' }) })));
  assert.deepEqual(values, [null]);
  assert.ok(errors.includes('Geçersiz tarih'));
});

test('cancel aborts the previous KPI HTTP request', () => {
  const { startKpiRequest } = panel();
  let signal;
  const pending = new Promise(() => {});
  const cancel = startKpiRequest({ from: '2026-09-15', to: '2026-09-16', technicianId: '' }, {
    report: () => {}, error: () => {}, loading: () => {},
  }, (_url, init) => {
    signal = init?.signal;
    return pending;
  });
  assert.ok(signal);
  assert.equal(signal.aborted, false);
  cancel();
  assert.equal(signal.aborted, true);
});
