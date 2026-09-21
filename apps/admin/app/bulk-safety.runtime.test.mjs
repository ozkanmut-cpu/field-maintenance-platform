import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function loadTs(name) {
  const filename = new URL(name, import.meta.url);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  Function('require', 'module', 'exports', source)((id) => id.startsWith('./') ? loadTs(id + '.tsx') : require(id), module, module.exports);
  return module.exports;
}
const bulk = loadTs('./bulk-operations.tsx');
const point = { id: 'p1', code: '101', name: 'Liman', status: 'ACTIVE', maintenanceType: 'SMARTCLEAN', maintenanceWeek: 2, smartcleanReferenceAt: '2026-07-01T00:00:00.000Z', region: { id: 'r1', name: 'Urla' }, aliases: [] };
test('Standard preview exposes type transition, changed week, and cleared SmartClean reference', () => {
  assert.equal(typeof bulk.buildBulkPreview, 'function', 'per-row preview builder is missing');
  assert.deepEqual(bulk.buildBulkPreview(point, { action: 'SET_STANDARD_WEEK', week: 1 }), [
    { field: 'Bakım türü', before: 'SmartClean', after: 'Standart' },
    { field: 'Rut haftası', before: 'Hafta 2', after: 'Hafta 1' },
    { field: 'SmartClean referansı', before: '2026-07-01', after: 'Temizlenecek' },
  ]);
});
test('SmartClean preview includes both week and reference, not only type', () => {
  assert.equal(typeof bulk.buildBulkPreview, 'function', 'per-row preview builder is missing');
  assert.deepEqual(bulk.buildBulkPreview({ ...point, maintenanceType: 'STANDARD', smartcleanReferenceAt: null }, { action: 'SET_SMARTCLEAN', week: 1, reference: '2026-09-21' }), [
    { field: 'Bakım türü', before: 'Standart', after: 'SmartClean' },
    { field: 'Rut haftası', before: 'Hafta 2', after: 'Hafta 1' },
    { field: 'SmartClean referansı', before: '—', after: '2026-09-21' },
  ]);
});
test('region and status previews show each selected row old and new value', () => {
  assert.equal(typeof bulk.buildBulkPreview, 'function');
  assert.deepEqual(bulk.buildBulkPreview(point, { action: 'SET_REGION', regionName: 'Konak' }), [{ field: 'Bölge', before: 'Urla', after: 'Konak' }]);
  assert.deepEqual(bulk.buildBulkPreview(point, { action: 'SET_STATUS', status: 'PASSIVE' }), [{ field: 'Durum', before: 'Aktif', after: 'Pasif' }]);
});
test('success outcome uses returned count, identifiers and action, including zero', () => {
  assert.equal(typeof bulk.parseBulkOutcome, 'function', 'response parsing is missing');
  assert.deepEqual(bulk.parseBulkOutcome({ updated: 1, pointIds: ['p2'], action: 'SET_STATUS' }), { updated: 1, pointIds: ['p2'], action: 'SET_STATUS' });
  assert.deepEqual(bulk.parseBulkOutcome({ updated: 0, pointIds: [], action: 'SET_REGION' }), { updated: 0, pointIds: [], action: 'SET_REGION' });
});
test('malformed or inconsistent outcomes cannot be presented as successful audit results', () => {
  assert.equal(typeof bulk.parseBulkOutcome, 'function');
  for (const value of [null, {}, { updated: 2, pointIds: ['p1'], action: 'SET_STATUS' }, { updated: 1, pointIds: ['p1'], action: 'UNKNOWN' }]) assert.throws(() => bulk.parseBulkOutcome(value), /doğrulanamadı/);
});

const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
test('preview renders a separately identified old-to-new row per point and transition effect', () => {
  assert.equal(typeof bulk.BulkPreviewTable, 'function', 'preview table is missing');
  const html = renderToStaticMarkup(createElement(bulk.BulkPreviewTable, { points: [point, { ...point, id: 'p2', code: '102', name: 'Kordon' }], change: { action: 'SET_STANDARD_WEEK', week: 1 } }));
  for (const text of ['101', '102', 'Liman', 'Kordon', 'Mevcut', 'Önerilen', 'Temizlenecek', 'Hafta 1', 'Hafta 2']) assert.ok(html.includes(text), text);
});
test('audit renders actual response count and ids, never a requested selection count', () => {
  assert.equal(typeof bulk.BulkAuditResult, 'function', 'audit result is missing');
  const html = renderToStaticMarkup(createElement(bulk.BulkAuditResult, { outcome: { updated: 1, pointIds: ['p2'], action: 'SET_STATUS' } }));
  for (const text of ['1 nokta', 'p2', 'SET_STATUS', 'POINT_BULK_UPDATED']) assert.ok(html.includes(text), text);
});

test('accepted response invalidates confirmation before parsing, even if its JSON is malformed', async () => {
  assert.equal(typeof bulk.readBulkResponse, 'function');
  const events = [];
  await assert.rejects(() => bulk.readBulkResponse({ ok: true, json: async () => { events.push('parse'); return {}; } }, () => events.push('reset')), /doğrulanamadı/);
  assert.deepEqual(events, ['reset', 'parse']);
});
test('successful mutation response supplies actual outcome and failed HTTP never resets selection', async () => {
  assert.equal(typeof bulk.readBulkResponse, 'function');
  let reset = false;
  await assert.rejects(() => bulk.readBulkResponse({ ok: false, status: 403 }, () => { reset = true; }), /403/);
  assert.equal(reset, false);
  assert.deepEqual(await bulk.readBulkResponse(new Response(JSON.stringify({ updated: 1, pointIds: ['p2'], action: 'SET_STATUS' })), () => { reset = true; }), { updated: 1, pointIds: ['p2'], action: 'SET_STATUS' });
  assert.equal(reset, true);
});
