import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as requests from './latest-request.mjs';
import * as policy from './paperwork-status-policy.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// Execute the real panels and event handlers with deterministic hook scheduling.
// Only network I/O and React's host scheduler are replaced; request ownership,
// state transitions, JSX output and user event callbacks remain production code.
function mount(file, fetcher) {
  const slots = [], pendingEffects = [], modules = new Map();
  let cursor = 0, dirty = true, tree;
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((dep, n) => !Object.is(dep, old.deps[n]))) {
        slots[i] = { deps, cleanup: old?.cleanup };
        pendingEffects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  function load(name) {
    if (name === 'react') return hooks;
    if (name === './latest-request.mjs') return requests;
    if (name === './paperwork-status-policy.mjs') return policy;
    if (!name.startsWith('.')) return require(name);
    if (modules.has(name)) return modules.get(name);
    const source = readFileSync(new URL(name + '.tsx', import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', 'fetch', js)(load, mod, mod.exports, fetcher);
    modules.set(name, mod.exports);
    return mod.exports;
  }
  const Panel = load('./' + file).default;
  function expand(node) {
    if (node == null || typeof node === 'boolean') return null;
    if (Array.isArray(node)) return node.map(expand);
    if (typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { type: node.type, props: node.props, children: expand(node.props.children) };
  }
  function render() {
    if (dirty) { dirty = false; cursor = 0; tree = expand(Panel()); while (pendingEffects.length) pendingEffects.shift()(); }
    return tree;
  }
  return {
    async settle() { for (let i = 0; i < 12; i++) { render(); await new Promise(resolve => setImmediate(resolve)); } render(); },
    tree: () => render(),
    unmount() { for (const slot of slots) if (slot && typeof slot.cleanup === 'function') slot.cleanup(); },
  };
}
function all(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => all(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...all(node.children, predicate)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  return node && typeof node === 'object' ? text(node.children) : String(node ?? '');
}
function panel(view, title) { return all(view.tree(), n => n.type === 'section').find(n => all(n, c => c.type === 'h2' && text(c) === title).length); }
function button(node, pattern) { const found = all(node, n => n.type === 'button' && pattern.test(text(n).trim())); assert.equal(found.length, 1, 'one visible recovery action: ' + pattern); return found[0]; }
const user = { id: 't1', name: 'Teknisyen Ada', username: 'ada', role: 'TECHNICIAN', active: true };
const point = { id: 'p1', code: '100', name: 'Kordon Market', region: null };
const visit = { type: 'MAINTENANCE', id: 'v1', at: '2026-09-21T10:00:00Z', performedAt: '2026-09-21T10:00:00Z', serviceSlipStatus: 'PENDING', confirmationStatus: 'PENDING', point };
const kind = { statusCounts: { pending: 0, present: 0, missing: 0, approved: 0 }, statusRates: { pending: 0, present: 0, missing: 0, approved: 0 }, arrival: { completedCount: 0, medianMinutes: null, p90Minutes: null }, resolution: { resolvedCount: 0, medianMinutes: null, p90Minutes: null }, pendingAgeBuckets: { under24h: 0, h24to48: 0, d2to7: 0, d7plus: 0 } };
const analytics = { from: '2026-09-01', to: '2026-09-21', technicianId: null, generatedAt: '2026-09-21T10:00:00Z', totalVisits: 0, serviceSlip: kind, confirmation: kind };
function network(failures = new Set()) {
  const calls = [];
  return { calls, failures, fetch: async url => {
    calls.push(url);
    const lane = url === '/api/backend/users' ? 'users' : url === '/api/backend/points' ? 'points' : url.includes('technician-history') ? 'visits' : url.includes('paperwork-analytics') ? 'analytics' : url.includes('paperwork-history') ? 'history' : url.includes('/assignments/point/') ? 'assignment' : 'effective';
    if (failures.has(lane)) return { ok: false, status: 503, json: async () => ({ message: lane + ' unavailable' }) };
    const data = lane === 'users' ? [user] : lane === 'points' ? [point] : lane === 'visits' ? { date: '2026-09-21', maintenanceCount: 1, items: [visit] } : lane === 'analytics' ? analytics : lane === 'history' ? [] : lane === 'assignment' ? { point, assignments: [] } : { pointId: 'p1', source: 'REGION', technicianId: 't1', technician: user };
    return { ok: true, status: 200, json: async () => data };
  } };
}

test('assignment initial failure retries points/users rather than a nonexistent selected point', async () => {
  const net = network(new Set(['points'])), view = mount('assignment-management', net.fetch);
  await view.settle();
  assert.doesNotMatch(text(view.tree()), /Görevlendirme kaydı yok|Teknisyen yok/);
  net.failures.clear();
  button(view.tree(), /Temel verileri yeniden dene/i).props.onClick();
  await view.settle();
  assert.equal(net.calls.filter(url => url === '/api/backend/points').length, 2);
  assert.match(text(view.tree()), /Teknisyen Ada/);
  view.unmount();
});
test('failed selected assignment point exposes source recovery without zero metrics or empty history', async () => {
  const net = network(new Set(['assignment'])), view = mount('assignment-management', net.fetch);
  await view.settle();
  assert.doesNotMatch(text(view.tree()), /Görevlendirme kaydı yok|Teknisyen yok/);
  assert.equal(all(view.tree(), n => n.props.className === 'dashboardGrid').length, 0);
  net.failures.clear();
  button(view.tree(), /Nokta verilerini yeniden dene/i).props.onClick();
  await view.settle();
  assert.match(text(view.tree()), /Görevlendirme kaydı yok/);
  view.unmount();
});
test('paperwork base failure remains recoverable after independent analytics refresh', async () => {
  const net = network(new Set(['users'])), view = mount('paperwork-management', net.fetch);
  await view.settle();
  button(panel(view, 'Evrak Tamamlanma Analitiği'), /YENİLE/).props.onClick();
  await view.settle();
  assert.doesNotMatch(text(view.tree()), /Bakım kaydı yok/);
  net.failures.clear();
  button(view.tree(), /Teknisyenleri yeniden dene/i).props.onClick();
  await view.settle();
  assert.equal(net.calls.filter(url => url === '/api/backend/users').length, 2);
  assert.match(text(view.tree()), /Kordon Market/);
  view.unmount();
});
test('paperwork visits failure remains recoverable after independent analytics refresh', async () => {
  const net = network(new Set(['visits'])), view = mount('paperwork-management', net.fetch);
  await view.settle();
  button(panel(view, 'Evrak Tamamlanma Analitiği'), /YENİLE/).props.onClick();
  await view.settle();
  assert.doesNotMatch(text(view.tree()), /Bakım kaydı yok/);
  net.failures.clear();
  button(view.tree(), /Bakım kayıtlarını yeniden dene/i).props.onClick();
  await view.settle();
  assert.match(text(view.tree()), /Kordon Market/);
  view.unmount();
});
test('analytics failure is not permanent loading and does not suppress successful visit rows', async () => {
  const net = network(new Set(['analytics'])), view = mount('paperwork-management', net.fetch);
  await view.settle();
  const analyticsPanel = panel(view, 'Evrak Tamamlanma Analitiği');
  assert.match(text(analyticsPanel), /analytics unavailable/);
  assert.doesNotMatch(text(analyticsPanel), /Analitik hazırlanıyor/);
  assert.match(text(view.tree()), /Kordon Market/);
  net.failures.clear();
  button(analyticsPanel, /Analitiği yeniden dene/i).props.onClick();
  await view.settle();
  assert.match(text(panel(view, 'Evrak Tamamlanma Analitiği')), /Analiz edilen bakım/);
  view.unmount();
});
test('history failure opens its own retry without hiding visits or inventing empty audit', async () => {
  const net = network(new Set(['history'])), view = mount('paperwork-management', net.fetch);
  await view.settle();
  button(view.tree(), /^GEÇMİŞ$/).props.onClick();
  await view.settle();
  assert.match(text(panel(view, 'Evrak Değişiklik Geçmişi')), /history unavailable/);
  assert.doesNotMatch(text(view.tree()), /Evrak değişikliği yok/);
  assert.match(text(view.tree()), /Kordon Market/);
  net.failures.clear();
  button(view.tree(), /Geçmişi yeniden dene/i).props.onClick();
  await view.settle();
  assert.match(text(panel(view, 'Evrak Değişiklik Geçmişi')), /Evrak değişikliği yok/);
  view.unmount();
});

test('assignment audit failure stays in an open recoverable panel without hiding point history', async () => {
  const net = network();
  let auditFailed = true;
  const assignment = { id: 'a1', pointId: 'p1', technicianId: 't1', kind: 'POINT_OVERRIDE', startsAt: '2026-01-01T10:00:00Z', endsAt: null, active: true, reason: null, createdAt: '2026-01-01T10:00:00Z', deactivatedAt: null, technician: user, createdBy: user };
  const fetcher = async url => {
    if (url.includes('/audit-history')) return auditFailed ? { ok: false, status: 503, json: async () => ({ message: 'audit unavailable' }) } : { ok: true, status: 200, json: async () => ({ assignment, history: [] }) };
    if (url.includes('/assignments/point/')) return { ok: true, status: 200, json: async () => ({ point, assignments: [assignment] }) };
    return net.fetch(url);
  };
  const view = mount('assignment-management', fetcher);
  await view.settle();
  button(view.tree(), /^AUDIT$/).props.onClick();
  await view.settle();
  assert.match(text(panel(view, 'Görevlendirme Audit Geçmişi')), /audit unavailable/);
  assert.match(text(view.tree()), /Kordon Market/);
  auditFailed = false;
  button(view.tree(), /Audit geçmişini yeniden dene/i).props.onClick();
  await view.settle();
  assert.doesNotMatch(text(panel(view, 'Görevlendirme Audit Geçmişi')), /audit unavailable/);
  assert.match(text(panel(view, 'Görevlendirme Audit Geçmişi')), /Audit kaydı yok/);
  view.unmount();
});

test('paperwork bulk selection excludes rows hidden by a later search', async () => {
  const net = network(), view = mount('paperwork-management', net.fetch);
  await view.settle();
  all(view.tree(), n => n.type === 'input' && n.props['aria-label'] === '100 kodlu bakım kaydını seç')[0].props.onChange();
  await view.settle();
  assert.equal(button(view.tree(), /SEÇİLİLERİ GÜNCELLE/).props.disabled, false);
  all(view.tree(), n => n.type === 'input' && n.props['aria-label'] === 'Evrak kayıtlarında ara')[0].props.onChange({ target: { value: 'no matching point' } });
  await view.settle();
  assert.equal(button(view.tree(), /SEÇİLİLERİ GÜNCELLE/).props.disabled, true);
  view.unmount();
});

test('failed paperwork refresh removes stale selectable rows and never exposes stale metrics', async () => {
  const net = network(), view = mount('paperwork-management', net.fetch);
  await view.settle();
  all(view.tree(), n => n.type === 'input' && n.props['aria-label'] === '100 kodlu bakım kaydını seç')[0].props.onChange();
  await view.settle();
  net.failures.add('visits');
  button(panel(view, 'Evrak Yönetimi'), /YENİLE/).props.onClick();
  await view.settle();
  assert.equal(button(view.tree(), /SEÇİLİLERİ GÜNCELLE/).props.disabled, true);
  assert.equal(all(view.tree(), n => n.type === 'input' && n.props['aria-label'] === '100 kodlu bakım kaydını seç').length, 0);
  assert.equal(all(view.tree(), n => n.props.className === 'dashboardGrid').length, 1, 'only independent analytics metrics remain');
  view.unmount();
});
