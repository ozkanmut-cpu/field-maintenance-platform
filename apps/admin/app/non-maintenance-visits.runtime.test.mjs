import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const jsx = (type, props) => ({ type, props: props ?? {} });
function render(visits, purpose = 'ALL', query = '') {
  const states = [[{ id: 'tech', name: 'Özge Kaya', role: 'TECHNICIAN', active: true }], visits, '2026-09-21', 'ALL', purpose, query, false, ''];
  let index = 0;
  const exports = {};
  const source = readFileSync(new URL('./non-maintenance-visits.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)((name) => {
    if (name === 'react') return { useState: () => [states[index++], () => {}], useRef: (current) => ({ current }), useEffect: () => {}, useMemo: (fn) => fn() };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (name === './admin-icons') return { AdminIcon: 'icon' };
    throw new Error(`Unexpected dependency: ${name}`);
  }, exports);
  return exports.default();
}
function nodes(node) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return typeof node === 'object' ? [node, ...nodes(node.props.children)] : [node];
}
const text = (node) => nodes(node).filter((value) => typeof value !== 'object').join(' ').replace(/\s+/g, ' ');
const visit = (purpose = 'BREAKDOWN', extra = {}) => ({ id: purpose, purpose, visitedAt: '2026-09-21T10:00:00Z', locationCapturedAt: null, latitude: null, longitude: null, accuracyMeters: null, point: null, customerName: 'Kordon Balıkçısı', note: null, visualExplanation: 'EFESİM görseli eklenemedi', technician: { id: 'tech', name: 'Özge Kaya' }, ...extra });
const purposes = [ ['BREAKDOWN', 'Arıza'], ['FAULTY_KEG', 'Arızalı Fıçı'], ['FACILITY_INSTALLATION', 'Tesis Kurulum'], ['FACILITY_REMOVAL', 'Tesis Sökme'], ['MOBILE_INSTALLATION', 'Seyyar Kurulum'], ['MOBILE_REMOVAL', 'Seyyar Sökme'], ['SMART_TAP_INSTALLATION', 'Smart Tap Kurulum'], ['SMART_TAP_BREAKDOWN', 'Smart Tap Arıza'], ['SMART_TAP_REMOVAL', 'Smart Tap Sökme'], ['SURVEY', 'Keşif'] ];

test('customerless visit renders its actual identity, absence of point and GPS, and fallback explanation', () => {
  const output = text(render([visit()]));
  assert.match(output, /Kordon Balıkçısı/);
  assert.match(output, /Müşteri kaydı yok/);
  assert.match(output, /Konum alınmadı/);
  assert.match(output, /EFESİM görseli eklenemedi/);
  assert.doesNotMatch(output, /0\.00000/);
});
test('customerless visits are searchable by customer identity, no-customer state and fallback explanation', () => {
  for (const query of ['kordon', 'müşteri kaydı yok', 'efesim']) {
    assert.match(text(render([visit()], 'ALL', query)), /1 kayıt gösteriliyor/);
  }
  assert.match(text(render([visit()], 'ALL', 'olmayan müşteri')), /0 kayıt gösteriliyor/);
});
test('all ten purposes have readable filters, rows and aggregate counts; legacy visits remain visible', () => {
  const rows = purposes.map(([key]) => visit(key));
  const tree = render(rows);
  const options = nodes(tree).filter((node) => node?.type === 'option');
  for (const [key, label] of purposes) {
    assert.equal(text(options.find((node) => node.props.value === key)), label);
    const filtered = render(rows, key);
    assert.match(text(filtered), /1 kayıt gösteriliyor/);
    const lastRow = nodes(filtered).filter((node) => node?.type === 'tr').at(-1);
    assert.match(text(lastRow), new RegExp(label));
  }
  const cards = nodes(tree).filter((node) => node?.props?.className === 'dashboardCard').map(text);
  assert.ok(cards.some((value) => /Arıza.*3/.test(value)), cards.join('\n'));
  assert.ok(cards.some((value) => /Kurulum \/ Söküm.*6.*3 \/ 3/.test(value)), cards.join('\n'));
  for (const key of ['INSTALLATION', 'REMOVAL']) assert.match(text(render([visit(key)])), /Tesis/);
});
test('registered point and real zero GPS retain their existing meaning', () => {
  const output = text(render([visit('SURVEY', { point: { id: 'point', name: 'Sahil Lokantası', code: '123', status: 'ACTIVE' }, latitude: 0, longitude: 0, accuracyMeters: 12 })]));
  assert.match(output, /Sahil Lokantası/);
  assert.match(output, /123 · ACTIVE/);
  assert.match(output, /0\.00000\s*,.*0\.00000/);
  assert.doesNotMatch(output, /Konum alınmadı|Müşteri kaydı yok/);
});
