import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const operationsWorkflow = fs.readFileSync(new URL('../../../.github/workflows/operations-ci.yml', import.meta.url), 'utf8');

function panel() {
  const filename = new URL('./assignment-management.tsx', import.meta.url);
  const source = fs.readFileSync(filename, 'utf8');
  const ts = require('typescript');
  const js = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const panelRequire = (id) => id === './admin-icons' ? { AdminIcon: () => null } : id === './admin-primitives' ? { AdminFilterToolbar: ({ children }) => children } : require(id);
  new Function('require', 'module', 'exports', js)(panelRequire, mod, mod.exports);
  return mod.exports;
}

test('superseded point requests cannot replace the selected point history or effective technician', async () => {
  const { startAssignmentPointRequest } = panel();
  const history = [];
  const effective = [];
  const errors = [];
  const loading = [];
  const pending = [];
  const fetcher = (url, init) => new Promise((resolve) => pending.push({ url, resolve, signal: init.signal }));
  const handlers = {
    history: (value) => history.push(value),
    effective: (value) => effective.push(value),
    audit: () => {},
    error: (value) => { if (value) errors.push(value); },
    loading: (value) => loading.push(value),
  };

  const cancelOld = startAssignmentPointRequest('old', handlers, fetcher);
  cancelOld();
  startAssignmentPointRequest('new', handlers, fetcher);
  assert.deepEqual(pending.map((request) => request.url), [
    '/api/backend/assignments/point/old',
    '/api/backend/assignments/effective/old',
    '/api/backend/assignments/point/new',
    '/api/backend/assignments/effective/new',
  ]);
  assert.equal(pending[0].signal.aborted, true);

  pending[0].resolve({ ok: true, status: 200, json: async () => ({ point: { id: 'old' }, assignments: [] }) });
  pending[1].resolve({ ok: true, status: 200, json: async () => ({ pointId: 'old', technicianId: 'old-tech' }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(history.filter(Boolean), []);
  assert.deepEqual(effective.filter(Boolean), []);
  assert.deepEqual(errors, []);
  assert.equal(loading.at(-1), true);

  pending[2].resolve({ ok: true, status: 200, json: async () => ({ point: { id: 'new' }, assignments: [] }) });
  pending[3].resolve({ ok: true, status: 200, json: async () => ({ pointId: 'new', technicianId: 'new-tech' }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(history.filter(Boolean), [{ point: { id: 'new' }, assignments: [] }]);
  assert.deepEqual(effective.filter(Boolean), [{ pointId: 'new', technicianId: 'new-tech' }]);
  assert.equal(loading.at(-1), false);
});

test('assignment history distinguishes planned, current, expired, and manually closed assignments', () => {
  const { assignmentTimingStatus } = panel();
  const now = new Date('2026-09-19T12:00:00.000Z');

  assert.equal(assignmentTimingStatus({ active: true, startsAt: '2026-09-20T12:00:00.000Z', endsAt: null }, now), 'PLANNED');
  assert.equal(assignmentTimingStatus({ active: true, startsAt: '2026-09-19T11:00:00.000Z', endsAt: '2026-09-19T13:00:00.000Z' }, now), 'CURRENT');
  assert.equal(assignmentTimingStatus({ active: true, startsAt: '2026-09-18T11:00:00.000Z', endsAt: '2026-09-19T11:00:00.000Z' }, now), 'EXPIRED');
  assert.equal(assignmentTimingStatus({ active: false, startsAt: '2026-09-18T11:00:00.000Z', endsAt: null }, now), 'CLOSED');
});

test('superseded audit requests cannot reveal an audit record for a previous assignment', async () => {
  const { startAssignmentAuditRequest } = panel();
  const audit = [];
  const errors = [];
  const loading = [];
  const pending = [];
  const fetcher = (url, init) => new Promise((resolve) => pending.push({ url, resolve, signal: init.signal }));
  const handlers = {
    audit: (value) => audit.push(value),
    error: (value) => { if (value) errors.push(value); },
    loading: (value) => loading.push(value),
  };

  const cancelOld = startAssignmentAuditRequest('old-assignment', handlers, fetcher);
  cancelOld();
  startAssignmentAuditRequest('new-assignment', handlers, fetcher);
  assert.deepEqual(pending.map((request) => request.url), [
    '/api/backend/assignments/old-assignment/audit-history',
    '/api/backend/assignments/new-assignment/audit-history',
  ]);
  assert.equal(pending[0].signal.aborted, true);

  pending[0].resolve({ ok: true, status: 200, json: async () => ({ assignment: { id: 'old-assignment' }, history: [] }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(audit.filter(Boolean), []);
  assert.deepEqual(errors, []);
  assert.equal(loading.at(-1), true);

  pending[1].resolve({ ok: true, status: 200, json: async () => ({ assignment: { id: 'new-assignment' }, history: [] }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(audit.filter(Boolean), [{ assignment: { id: 'new-assignment' }, history: [] }]);
  assert.equal(loading.at(-1), false);
});

test('assignment actions remain busy while any overlapping point, mutation, or audit work continues', () => {
  const { isAssignmentBusy } = panel();
  assert.equal(isAssignmentBusy({ point: true, mutation: false, audit: false }), true);
  assert.equal(isAssignmentBusy({ point: false, mutation: true, audit: false }), true);
  assert.equal(isAssignmentBusy({ point: false, mutation: false, audit: true }), true);
  assert.equal(isAssignmentBusy({ point: false, mutation: false, audit: false }), false);
});

test('assignment list filters combine status, kind and text consistently', () => {
  const { filterAssignments } = panel();
  const now = new Date('2026-09-19T12:00:00.000Z');
  const assignments = [
    { id: 'active', active: true, startsAt: '2026-09-19T11:00:00.000Z', endsAt: null, kind: 'POINT_OVERRIDE', technician: { name: 'Ayşe' }, createdBy: { name: 'Admin' }, reason: 'İzin' },
    { id: 'closed', active: false, startsAt: '2026-09-18T11:00:00.000Z', endsAt: null, kind: 'TEMPORARY', technician: { name: 'Mert' }, createdBy: { name: 'Admin' }, reason: 'Vardiya' },
  ];
  assert.deepEqual(filterAssignments(assignments, { status: 'ACTIVE', search: 'ayşe' }, now).map((item) => item.id), ['active']);
  assert.deepEqual(filterAssignments(assignments, { status: 'TEMPORARY', search: '' }, now).map((item) => item.id), ['closed']);
});

test('a planned assignment refreshes the effective technician at its start boundary', () => {
  const { startAssignmentTimingRefresh } = panel();
  const scheduled = [];
  const cleared = [];
  let effectiveRefreshes = 0;
  const now = new Date('2026-09-19T12:00:00.000Z');
  const stop = startAssignmentTimingRefresh(
    [{ active: true, startsAt: '2026-09-19T12:05:00.000Z', endsAt: null }],
    now,
    () => { effectiveRefreshes += 1; },
    {
      setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return 'future-start'; },
      clearTimeout: (handle) => { cleared.push(handle); },
    },
  );

  assert.deepEqual(scheduled.map(({ delay }) => delay), [300_000]);
  scheduled[0].callback();
  assert.equal(effectiveRefreshes, 1);
  stop();
  assert.deepEqual(cleared, ['future-start']);
});

test('a current temporary assignment refreshes the effective technician at its end boundary', () => {
  const { startAssignmentTimingRefresh } = panel();
  const scheduled = [];
  let effectiveRefreshes = 0;
  startAssignmentTimingRefresh(
    [{ active: true, startsAt: '2026-09-19T11:00:00.000Z', endsAt: '2026-09-19T12:05:00.000Z' }],
    new Date('2026-09-19T12:00:00.000Z'),
    () => { effectiveRefreshes += 1; },
    {
      setTimeout: (callback, delay) => { scheduled.push({ callback, delay }); return 'temporary-end'; },
      clearTimeout: () => {},
    },
  );

  assert.deepEqual(scheduled.map(({ delay }) => delay), [300_000]);
  scheduled[0].callback();
  assert.equal(effectiveRefreshes, 1);
});

test('a boundary refresh re-reads the effective technician from its authoritative API', async () => {
  const { startAssignmentEffectiveRequest } = panel();
  const effective = [];
  const errors = [];
  const loading = [];
  const requests = [];
  const fetcher = (url, init) => new Promise((resolve) => requests.push({ url, init, resolve }));
  startAssignmentEffectiveRequest('point-after-start', {
    effective: (value) => effective.push(value),
    error: (value) => { if (value) errors.push(value); },
    loading: (value) => loading.push(value),
  }, fetcher);

  assert.deepEqual(requests.map((request) => request.url), ['/api/backend/assignments/effective/point-after-start']);
  requests[0].resolve({ ok: true, status: 200, json: async () => ({ pointId: 'point-after-start', technicianId: 'new-tech', source: 'TEMPORARY' }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(effective.filter(Boolean), [{ pointId: 'point-after-start', technicianId: 'new-tech', source: 'TEMPORARY' }]);
  assert.deepEqual(errors, []);
  assert.equal(loading.at(-1), false);
});

test('a cancelled boundary refresh cannot replace the effective technician for a newer selection', async () => {
  const { startAssignmentEffectiveRequest } = panel();
  const effective = [];
  const pending = [];
  const fetcher = (url, init) => new Promise((resolve) => pending.push({ url, init, resolve }));
  const handlers = { effective: (value) => effective.push(value), error: () => {}, loading: () => {} };
  const cancelOld = startAssignmentEffectiveRequest('old-point', handlers, fetcher);
  cancelOld();
  startAssignmentEffectiveRequest('new-point', handlers, fetcher);
  assert.equal(pending[0].init.signal.aborted, true);

  pending[0].resolve({ ok: true, status: 200, json: async () => ({ pointId: 'old-point', technicianId: 'old-tech' }) });
  pending[1].resolve({ ok: true, status: 200, json: async () => ({ pointId: 'new-point', technicianId: 'new-tech' }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(effective, [{ pointId: 'new-point', technicianId: 'new-tech' }]);
});

test('Operations CI runs assignment reliability changes on pushes and pull requests', () => {
  for (const path of ['apps/api/src/assignments/**', 'apps/admin/app/assignment-management.tsx', 'apps/admin/app/assignment-management.smoke.test.mjs']) {
    assert.equal(operationsWorkflow.split(`'${path}'`).length - 1, 2, `${path} must trigger both push and pull-request validation`);
  }
  assert.match(operationsWorkflow, /src\/assignments\/assignments\.service\.spec\.ts/,
    'Operations CI must run the assignment backend regression');
  assert.match(operationsWorkflow, /apps\/admin\/app\/assignment-management\.smoke\.test\.mjs/,
    'Operations CI must run the assignment smoke regression');
});
