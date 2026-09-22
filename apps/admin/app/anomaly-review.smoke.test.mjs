import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('./anomaly-review.tsx', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

test('anomaly filters combine text, technician and review type without mutating the queue', () => {
  const ts = require('typescript');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => id === './admin-icons' || id === './accessible-table' || id === './admin-primitives' ? new Proxy({}, { get: () => () => null }) : require(id);
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  const items = [
    { id: 'a', technician: { id: 't1', name: 'Ayşe' }, point: { code: 'P1', name: 'Kafe' }, reviewReason: 'GPS uzak', locationReviewRequired: true, suspiciousBatch: false, enteredLate: false },
    { id: 'b', technician: { id: 't2', name: 'Mert' }, point: { code: 'P2', name: 'Market' }, reviewReason: 'seri', locationReviewRequired: false, suspiciousBatch: true, enteredLate: false },
  ];
  assert.deepEqual(mod.exports.filterAnomalyQueue(items, { search: 'gps', technicianId: 't1', reviewType: 'LOCATION' }).map((item) => item.id), ['a']);
  assert.deepEqual(mod.exports.filterAnomalyQueue(items, { search: '', technicianId: '', reviewType: 'SUSPICIOUS' }).map((item) => item.id), ['b']);
  assert.equal(items.length, 2);
});

test('anomaly review presents real queue metrics and keeps location decisions separate from maintenance approval', () => {
  assert.match(source, /Konum & Anomali İnceleme/);
  assert.match(source, /Konum kararı bakım statüsünü değiştirmez/);
  assert.match(source, /Konum incelemesi/);
  assert.match(source, /Şüpheli seri giriş/);
  assert.match(source, /Teknisyen konum onayı/);
  assert.match(source, /canonicalLongitude/);
  assert.match(source, /scanAll/);
});

test('anomaly review keeps the real review and location approval API contracts', () => {
  assert.match(source, /\/api\/backend\/maintenance\/review-queue\?limit=200/);
  assert.match(source, /\/api\/backend\/maintenance\/review-history\?visitId=/);
  assert.match(source, /\/api\/backend\/maintenance\/review-resolve/);
  assert.match(source, /\/api\/backend\/maintenance\/location-review\/approve-visit/);
});

test('anomaly review retains an explicit empty filtered queue state and ignores stale history responses', () => {
  assert.match(source, /İnceleme kuyruğunda eşleşen kayıt yok\./);
  assert.match(source, /AbortController/);
  assert.match(source, /signal:\s*controller\.signal/);
  assert.match(source, /return\s*\(\)\s*=>\s*controller\.abort\(\)/);
  assert.match(source, /if\s*\(!selected\)\s*\{\s*setHistory\(null\);\s*setHistoryLoading\(false\);/);
});

test('anomaly queue refreshes ignore stale responses after a location or resolution decision', () => {
  assert.match(source, /useRef/,
    'the queue needs a persistent request generation between refreshes');
  assert.match(source, /const loadGeneration = useRef\(0\);/);
  assert.match(source, /const generation = \+\+loadGeneration\.current;/);
  assert.match(source, /if \(generation !== loadGeneration\.current\) return;/,
    'a stale queue response must not reopen an item after a decision');
  assert.match(source, /if \(generation === loadGeneration\.current\) setLoading\(false\);/,
    'only the active refresh may settle loading');
});
