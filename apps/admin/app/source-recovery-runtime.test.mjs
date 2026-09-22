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
function mount(file, fetcher, props = {}) {
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
    if (dirty) { dirty = false; cursor = 0; tree = expand(Panel(props)); while (pendingEffects.length) pendingEffects.shift()(); }
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
function network(failures = new Set(), visitData = visit) {
  const calls = [];
  return { calls, failures, fetch: async url => {
    calls.push(url);
    const lane = url === '/api/backend/users' ? 'users' : url === '/api/backend/points' ? 'points' : url.includes('technician-history') ? 'visits' : url.includes('paperwork-analytics') ? 'analytics' : url.includes('paperwork-history') ? 'history' : url.includes('/assignments/point/') ? 'assignment' : 'effective';
    if (failures.has(lane)) return { ok: false, status: 503, json: async () => ({ message: lane + ' unavailable' }) };
    const data = lane === 'users' ? [user] : lane === 'points' ? [point] : lane === 'visits' ? { date: '2026-09-21', maintenanceCount: 1, items: [visitData] } : lane === 'analytics' ? analytics : lane === 'history' ? { visit: { id: visitData.id, status: 'VALID', serviceSlipStatus: visitData.serviceSlipStatus, confirmationStatus: visitData.confirmationStatus, point: visitData.point }, history: [] } : lane === 'assignment' ? { point, assignments: [] } : { pointId: 'p1', source: 'REGION', technicianId: 't1', technician: user };
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
test('paperwork base failure remains recoverable', async () => {
  const net = network(new Set(['users'])), view = mount('paperwork-management', net.fetch);
  await view.settle();
  assert.match(text(view.tree()), /users unavailable/);
  assert.doesNotMatch(text(view.tree()), /Eşleşen kayıt yok/);
  net.failures.clear();
  button(view.tree(), /^Yeniden dene$/i).props.onClick();
  await view.settle();
  assert.equal(net.calls.filter(url => url === '/api/backend/users').length, 2);
  assert.match(text(view.tree()), /Kordon Market/);
  view.unmount();
});
test('paperwork visits failure remains recoverable', async () => {
  const net = network(new Set(['visits'])), view = mount('paperwork-management', net.fetch);
  await view.settle();
  assert.match(text(view.tree()), /visits unavailable/);
  assert.doesNotMatch(text(view.tree()), /Eşleşen kayıt yok/);
  net.failures.clear();
  button(view.tree(), /^Yeniden dene$/i).props.onClick();
  await view.settle();
  assert.match(text(view.tree()), /Kordon Market/);
  view.unmount();
});
test('analytics failure is not permanent loading and does not suppress successful visit rows', async () => {
  const net = network(new Set(['analytics'])), view = mount('paperwork-management', net.fetch);
  await view.settle();
  const analyticsPanel = all(view.tree(), node => node.type === 'details').find(node => /Evrak Tamamlanma Analitiği/.test(text(node)));
  assert.match(text(analyticsPanel), /analytics unavailable/);
  assert.match(text(view.tree()), /Kordon Market/);
  net.failures.clear();
  button(analyticsPanel, /^Yeniden dene$/i).props.onClick();
  await view.settle();
  assert.match(text(analyticsPanel), /Evrak Tamamlanma Analitiği/);
  view.unmount();
});
test('history failure opens its own retry without hiding visits or inventing empty audit', async () => {
  const net = network(new Set(['history'])), view = mount('paperwork-management', net.fetch);
  await view.settle();
  button(view.tree(), /^Detay$/).props.onClick();
  await view.settle();
  const historyPanel = panel(view, 'Evrak Değişiklik Geçmişi');
  assert.match(text(historyPanel), /history unavailable/);
  assert.match(text(historyPanel), /Kordon Market/);
  assert.match(text(historyPanel), /Teknisyen Ada/);
  assert.match(text(historyPanel), /21\.09\.2026/);
  assert.doesNotMatch(text(view.tree()), /Evrak değişikliği yok/);
  assert.match(text(view.tree()), /Kordon Market/);
  net.failures.clear();
  button(panel(view, 'Evrak Değişiklik Geçmişi'), /^Yeniden dene$/i).props.onClick();
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

test('paperwork decisions update only their row without reloading the visit dataset', async () => {
  const net = network();
  const payloads = [];
  const fetcher = async (url, init) => {
    if (url === '/api/backend/maintenance/paperwork') {
      payloads.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return net.fetch(url);
  };
  const view = mount('paperwork-management', fetcher);
  await view.settle();
  const visitCalls = net.calls.filter(url => url.includes('technician-history')).length;
  button(view.tree(), /^Teyit Onaylandı$/).props.onClick();
  await view.settle();
  assert.deepEqual(payloads, [{ visitId: 'v1', kind: 'CONFIRMATION', status: 'APPROVED', note: 'Teyit admin tarafından onaylandı.' }]);
  assert.equal(net.calls.filter(url => url.includes('technician-history')).length, visitCalls);
  assert.match(text(view.tree()), /Kaydedildi/);
  assert.doesNotMatch(text(view.tree()), /Manuel final/,
    'technician-history does not return a durable approval source');
  view.unmount();
});

test('a pending paperwork mutation locks every decision on its row', async () => {
  const net = network();
  let releaseMutation;
  const mutation = new Promise((resolve) => { releaseMutation = resolve; });
  const fetcher = async (url, init) => {
    if (url === '/api/backend/maintenance/paperwork') {
      await mutation;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return net.fetch(url, init);
  };
  const view = mount('paperwork-management', fetcher);
  await view.settle();
  button(view.tree(), /^Teyit Onaylandı$/).props.onClick();
  await new Promise((resolve) => setImmediate(resolve));

  for (const label of [/^Teyit Onaylandı$/, /^Teyit Yok$/, /^Teyit Eksik$/, /^Fiş Var$/, /^Fiş Yok$/, /^Detay$/]) {
    assert.equal(button(view.tree(), label).props.disabled, true, `${label} must lock with the row`);
  }

  releaseMutation();
  await view.settle();
  assert.equal(button(view.tree(), /^Fiş Yok$/).props.disabled, false);
  view.unmount();
});

test('persisted missing confirmation is neutral because the API cannot distinguish yok from eksik', async () => {
  const missingVisit = { ...visit, confirmationStatus: 'MISSING' };
  const net = network(new Set(), missingVisit);
  const view = mount('paperwork-management', net.fetch);
  await view.settle();

  assert.equal(button(view.tree(), /^Teyit Yok$/).props['aria-pressed'], false);
  assert.equal(button(view.tree(), /^Teyit Eksik$/).props['aria-pressed'], false);
  assert.match(text(view.tree()), /Eksik \/ yok/);
  view.unmount();
});

test('failed paperwork decision retains the row and retries the same single-record action', async () => {
  const net = network();
  let fail = true;
  const payloads = [];
  const fetcher = async (url, init) => {
    if (url === '/api/backend/maintenance/paperwork') {
      payloads.push(JSON.parse(init.body));
      return fail
        ? { ok: false, status: 503, json: async () => ({ message: 'paperwork unavailable' }) }
        : { ok: true, status: 200, json: async () => ({}) };
    }
    return net.fetch(url);
  };
  const view = mount('paperwork-management', fetcher);
  await view.settle();
  button(view.tree(), /^Fiş Yok$/).props.onClick();
  await view.settle();
  assert.match(text(view.tree()), /paperwork unavailable/);
  assert.match(text(view.tree()), /Kordon Market/);
  fail = false;
  button(view.tree(), /^Tekrar dene$/).props.onClick();
  await view.settle();
  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0], payloads[1]);
  assert.match(text(view.tree()), /Kaydedildi/);
  view.unmount();
});

test('failed paperwork refresh removes stale rows and counters', async () => {
  const net = network(), view = mount('paperwork-management', net.fetch);
  await view.settle();
  assert.match(text(view.tree()), /Kordon Market/);
  net.failures.add('visits');
  button(view.tree(), /^Yenile$/).props.onClick();
  await view.settle();
  assert.doesNotMatch(text(view.tree()), /Kordon Market/);
  assert.match(text(view.tree()), /Bakım kayıtları alınamadı/);
  view.unmount();
});

for (const lane of ['effective', 'audit']) {
  test('point detail ' + lane + ' failure has independent recovery without invented data', async () => {
    const failures = new Set([lane]);
    const calls = [];
    const fetcher = async url => {
      calls.push(url);
      const source = url.includes('/effective/') ? 'effective' : url.includes('/audit?') ? 'audit' : 'other';
      if (failures.has(source)) return { ok: false, status: 503 };
      return { ok: true, json: async () => source === 'effective' ? { technician: { name: 'Ege Usta' } } : url.endsWith('/points/p1') ? { ...point, status: 'ACTIVE', maintenanceType: 'STANDARD' } : [] };
    };
    const view = mount('point-detail-page', fetcher, { location: { section: 'point-detail', pointId: 'p1', detailTab: 'audit' }, onNavigate() {} });
    await view.settle();
    assert.match(text(view.tree()), /HTTP 503/);
    assert.doesNotMatch(text(view.tree()), /Yükleniyor…/);
    if (lane === 'audit') assert.doesNotMatch(text(view.tree()), /audit kaydı yok/);
    failures.clear();
    button(view.tree(), lane === 'audit' ? /Sekme verilerini yeniden dene/ : /Geçerli teknisyeni yeniden dene/).props.onClick();
    await view.settle();
    assert.doesNotMatch(text(view.tree()), /HTTP 503/);
    assert.match(text(view.tree()), /Ege Usta/);
    assert.match(text(view.tree()), /audit kaydı yok/);
    assert.equal(calls.filter(url => lane === 'audit' ? url.includes('/audit?') : url.includes('/effective/')).length, 2);
    view.unmount();
  });
}

for (const lane of ['points', 'regions']) {
  test('bulk initial ' + lane + ' failure gates selection and recovers the failed source', async () => {
    let failed = true;
    const calls = [];
    const view = mount('bulk-operations', async url => {
      calls.push(url);
      if (failed && url.endsWith('/' + lane)) return { ok: false, status: 503 };
      return { ok: true, json: async () => url.endsWith('/points') ? [{ ...point, aliases: [], status: 'ACTIVE' }] : [{ id: 'r1', name: 'Urla' }] };
    });
    await view.settle();
    assert.match(text(view.tree()), /HTTP 503/);
    assert.doesNotMatch(text(view.tree()), /Eşleşen nokta yok|nokta seçildi|Değişiklikleri Önizle/);
    assert.equal(all(view.tree(), n => n.props.className === 'filterCount').length, 0);
    assert.equal(all(view.tree(), n => n.type === 'input' && n.props.type === 'checkbox').length, 0);
    failed = false;
    button(view.tree(), lane === 'points' ? /Noktaları yeniden dene/ : /Bölgeleri yeniden dene/).props.onClick();
    await view.settle();
    assert.doesNotMatch(text(view.tree()), /HTTP 503/);
    assert.match(text(view.tree()), /Kordon Market/);
    assert.equal(calls.filter(url => url.endsWith('/' + lane)).length, 2);
    assert.equal(calls.filter(url => !url.endsWith('/' + lane)).length, 1);
    view.unmount();
  });
}
