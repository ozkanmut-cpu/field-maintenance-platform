import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('./location-matching.tsx', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

function locationModule() {
  const ts = require('typescript');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => id === './admin-icons' || id === './admin-primitives' ? new Proxy({}, { get: () => () => null }) : require(id);
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  return mod.exports;
}

test('matching filters distinguish ready, review and missing records while searching all point identities', () => {
  const { filterLocationMatches } = locationModule();
  const points = [
    { id: '1', code: 'SAP-1', name: 'Kadıköy İskele', googlePlaceId: 'g1', locationConfidence: 92 },
    { id: '2', code: 'SAP-2', name: 'Beşiktaş', sapName: 'Meydan', googlePlaceId: 'g2', locationConfidence: 68 },
    { id: '3', code: 'SAP-3', name: 'Üsküdar Sahil', googlePlaceId: null, locationConfidence: 0 },
  ];
  assert.deepEqual(filterLocationMatches(points, '', 'READY').map((point) => point.id), ['1']);
  assert.deepEqual(filterLocationMatches(points, '', 'REVIEW').map((point) => point.id), ['2']);
  assert.deepEqual(filterLocationMatches(points, '', 'MISSING').map((point) => point.id), ['3']);
  assert.deepEqual(filterLocationMatches(points, 'meydan', 'ALL').map((point) => point.id), ['2']);
});

test('SAP / Google comparison keeps matching separate from point-detail navigation', () => {
  assert.match(source, /onNavigate:\s*\(section: AdminSection, values\?: Omit<AdminLocation, 'section'>\) => void/,
    'the comparison screen must receive the shell navigation contract');
  assert.match(source, /onNavigate\('point-detail', \{ pointId: point\.id \}\)/,
    'each matched point must offer the real point detail flow');
  assert.match(source, />DETAY<\/button>/,
    'the comparison table must expose a visible detail action');
  assert.match(source, /address-discovery/,
    'existing real matching operations must remain available');
});
