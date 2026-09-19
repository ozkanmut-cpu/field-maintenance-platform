import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./maintenance-calendar.tsx', import.meta.url), 'utf8');

function calendarModule() {
  const ts = require('typescript');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => id === './admin-icons'
    ? { AdminIcon: () => null }
    : require(id);
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  return mod.exports;
}

test('maintenance calendar keeps real due and obligation history contracts in an operational queue', () => {
  assert.match(source, /\/api\/backend\/maintenance\/due/);
  assert.match(source, /\/api\/backend\/maintenance\/obligations\/point\//);
  assert.match(source, /Geciken/);
  assert.match(source, /Bu dönem/);
  assert.match(source, /Atanmamış/);
  assert.match(source, /Yükümlülük Geçmişi/);
});

test('maintenance calendar supports status, technician and maintenance-type filters without mutations', () => {
  assert.match(source, /aria-label="Bakım durumu filtresi"/);
  assert.match(source, /aria-label="Teknisyen filtresi"/);
  assert.match(source, /aria-label="Bakım tipi filtresi"/);
  assert.match(source, /maintenanceTypeFilter/);
  assert.match(source, /technicianFilter/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
});

test('maintenance calendar refreshes the queue for a changed as-of date and only offers active technicians', () => {
  assert.match(source, /useEffect\(\(\) => \{\s*load\(\);\s*return \(\) =>/);
  assert.match(source, /user\.role === "TECHNICIAN" && user\.active/);
});

test('maintenance calendar keeps history loading and empty states separate without blocking queue controls', () => {
  assert.match(source, /const \[historyStatus, setHistoryStatus\] = useState<"IDLE" \| "LOADING" \| "READY" \| "ERROR">\("IDLE"\)/);
  assert.match(source, /setHistory\(null\);\s*setHistoryStatus\("LOADING"\)/);
  assert.match(source, /historyStatus === "LOADING"/);
  assert.match(source, /historyStatus === "READY" && history && history\.items\.length === 0/);
  assert.match(source, /const \[listLoading, setListLoading\] = useState\(false\)/);
  assert.match(source, /const \[historyLoading, setHistoryLoading\] = useState\(false\)/);
  assert.doesNotMatch(source, /const \[busy, setBusy\] = useState\(false\)/);
});

test('superseded maintenance queue requests cannot replace newer results, errors, or loading state', async () => {
  const { startMaintenanceQueueRequest } = calendarModule();
  for (const staleOutcome of ['success', 'error']) {
    const loading = [];
    const items = [];
    const errors = [];
    const deferred = [];
    const fetcher = (_url, init) => new Promise((resolve, reject) => {
      deferred.push({ resolve, reject, signal: init?.signal });
    });
    const handlers = {
      items: (value) => items.push(value),
      technicians: () => {},
      error: (value) => { if (value) errors.push(value); },
      loading: (value) => loading.push(value),
    };
    const cancelStale = startMaintenanceQueueRequest('2026-09-01', handlers, fetcher);
    cancelStale();
    startMaintenanceQueueRequest('2026-09-02', handlers, fetcher);
    assert.equal(deferred[0].signal.aborted, true);
    if (staleOutcome === 'success') {
      deferred[0].resolve({ ok: true, json: async () => ({ items: ['stale'] }) });
      deferred[1].resolve({ ok: true, json: async () => [] });
    } else {
      deferred[0].reject(new Error('stale failure'));
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(items, []);
    assert.deepEqual(errors, []);
    assert.equal(loading.at(-1), true);
    deferred[2].resolve({ ok: true, json: async () => ({ items: ['current'] }) });
    deferred[3].resolve({ ok: true, json: async () => [] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(items, [['current']]);
    assert.equal(loading.at(-1), false);
  }
});