import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./assistance.ts', import.meta.url);

function loadAssistance() {
  assert.ok(fs.existsSync(filename), 'assistance helper must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('exiting help mode before opening a self task omits assistedForTechnicianId from submission', () => {
  const { assistedTechnicianId, assistanceRequestFields, emptyAssistanceState } = loadAssistance();
  let helpDashboard = { technician: { id: 'tech-2', name: 'Zeynep' } };

  assert.deepEqual(assistanceRequestFields(assistedTechnicianId(helpDashboard)), {
    assistedForTechnicianId: 'tech-2',
  });

  const exit = emptyAssistanceState();
  helpDashboard = exit.helpDashboard;
  const selfTaskSubmission = {
    pointId: 'self-point',
    ...assistanceRequestFields(assistedTechnicianId(helpDashboard)),
  };

  assert.deepEqual(exit, {
    helpDashboard: null,
    pendingAssist: undefined,
    selectorVisible: false,
    error: null,
  });
  assert.deepEqual(selfTaskSubmission, { pointId: 'self-point' });
  assert.equal(Object.hasOwn(selfTaskSubmission, 'assistedForTechnicianId'), false);
});

test('an assisted dashboard response resolving after exit cannot restore help mode', async () => {
  const { DashboardRequestCoordinator, assistanceRequestFields } = loadAssistance();
  const requests = new DashboardRequestCoordinator();
  let visibleDashboard = { technician: { id: 'self' } };
  let resolveAssisted;
  const assistedResponse = new Promise(resolve => { resolveAssisted = resolve; });
  const assistedRequest = requests.beginSelection('tech-2');
  const assistedLoad = assistedResponse.then(dashboard => {
    if (requests.commit(assistedRequest)) visibleDashboard = dashboard;
  });

  requests.exitAssistance();
  const selfRequest = requests.beginRefresh();
  assert.ok(selfRequest);
  if (requests.commit(selfRequest)) visibleDashboard = { technician: { id: 'self' } };

  resolveAssisted({ technician: { id: 'tech-2' } });
  await assistedLoad;

  assert.equal(visibleDashboard.technician.id, 'self');
  assert.equal(requests.beginRefresh('tech-2'), null);
  assert.deepEqual(assistanceRequestFields(requests.selectedTechnicianId), {});
});

test('a refresh requested during technician selection cannot discard the explicit selection', async () => {
  const { DashboardRequestCoordinator } = loadAssistance();
  const requests = new DashboardRequestCoordinator();
  let visibleDashboard = { technician: { id: 'self' } };
  let assistanceLoading = true;
  let tasksLoading = false;
  let resolveSelection;
  const selectionResponse = new Promise(resolve => { resolveSelection = resolve; });
  const selectionRequest = requests.beginSelection('tech-2');
  const selectionLoad = selectionResponse.then(dashboard => {
    if (requests.commit(selectionRequest)) visibleDashboard = dashboard;
  }).finally(() => {
    if (requests.isCurrent(selectionRequest)) assistanceLoading = false;
  });

  const refreshRequest = requests.beginRefresh();
  if (refreshRequest) tasksLoading = true;
  resolveSelection({ technician: { id: 'tech-2' } });
  await selectionLoad;

  assert.equal(refreshRequest, null);
  assert.equal(visibleDashboard.technician.id, 'tech-2');
  assert.equal(assistanceLoading, false);
  assert.equal(tasksLoading, false);
});

test('technician selection supersedes an active refresh and settles both loading owners', async () => {
  const { DashboardRequestCoordinator } = loadAssistance();
  const requests = new DashboardRequestCoordinator();
  let visibleDashboard = { technician: { id: 'self' } };
  let tasksLoading = true;
  let assistanceLoading = false;
  let resolveRefresh;
  let resolveSelection;
  const refreshResponse = new Promise(resolve => { resolveRefresh = resolve; });
  const selectionResponse = new Promise(resolve => { resolveSelection = resolve; });
  const refreshRequest = requests.beginRefresh();
  assert.ok(refreshRequest);
  const refreshLoad = refreshResponse.then(dashboard => {
    if (requests.commit(refreshRequest)) visibleDashboard = dashboard;
  }).finally(() => {
    if (requests.isCurrent(refreshRequest)) tasksLoading = false;
  });

  const selectionRequest = requests.beginSelection('tech-2');
  if (selectionRequest.supersededRefresh) tasksLoading = false;
  assistanceLoading = true;
  const selectionLoad = selectionResponse.then(dashboard => {
    if (requests.commit(selectionRequest)) visibleDashboard = dashboard;
  }).finally(() => {
    if (requests.isCurrent(selectionRequest)) assistanceLoading = false;
  });

  resolveSelection({ technician: { id: 'tech-2' } });
  await selectionLoad;
  resolveRefresh({ technician: { id: 'self' } });
  await refreshLoad;

  assert.equal(visibleDashboard.technician.id, 'tech-2');
  assert.equal(tasksLoading, false);
  assert.equal(assistanceLoading, false);
});

test('a failed technician selection releases the serialized dashboard refresh', () => {
  const { DashboardRequestCoordinator } = loadAssistance();
  const requests = new DashboardRequestCoordinator();
  const selectionRequest = requests.beginSelection('tech-2');

  assert.equal(requests.beginRefresh(), null);
  const released = typeof requests.fail === 'function' && requests.fail(selectionRequest);
  assert.equal(released, true);
  assert.ok(requests.beginRefresh());
});
