import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./task-presentation.ts', import.meta.url);

function loadTypeScript(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

function loadPresentation() {
  assert.ok(fs.existsSync(filename), 'task presentation helper must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const search = loadTypeScript(new URL('../search.ts', import.meta.url));
  new Function('module', 'exports', 'require', js)(mod, mod.exports, (id) => {
    if (id === '../search') return search;
    throw new Error(`unexpected dependency: ${id}`);
  });
  return mod.exports;
}

const task = (id, overrides = {}) => ({
  pointId: id,
  pointCode: `P-${id}`,
  pointName: `Nokta ${id}`,
  regionName: 'İzmir',
  priority: 'CURRENT',
  overduePeriods: 0,
  dueStart: '2026-09-14',
  dueEnd: '2026-09-20',
  ...overrides,
});

test('orders overdue tasks first and distances only within the same priority', () => {
  const { orderTasks } = loadPresentation();
  const tasks = [
    task('current-far', { latitude: 38.50, longitude: 27.10 }),
    task('late-far', { priority: 'OVERDUE', latitude: 38.50, longitude: 27.10 }),
    task('late-near', { priority: 'OVERDUE', latitude: 38.40, longitude: 27.10 }),
    task('current-near', { latitude: 38.40, longitude: 27.10 }),
  ];

  assert.deepEqual(
    orderTasks(tasks, { latitude: 38.40, longitude: 27.10 }).map(item => item.pointId),
    ['late-near', 'late-far', 'current-near', 'current-far'],
  );
  assert.deepEqual(tasks.map(item => item.pointId), ['current-far', 'late-far', 'late-near', 'current-near']);
});

test('filters tasks with the established address and alias search behavior', () => {
  const { filterTasks } = loadPresentation();
  const tasks = [task('one', { pointName: 'İzmir Büfe', address: 'İskele Caddesi 10', aliases: ['Eski Meyhane'] })];

  assert.equal(filterTasks(tasks, 'izmir').length, 1);
  assert.equal(filterTasks(tasks, 'iskele caddesi').length, 1);
  assert.equal(filterTasks(tasks, 'eski meyhane').length, 1);
  assert.equal(filterTasks(tasks, 'bornova').length, 0);
});

test('returns weekly dashboard counts without deriving a new maintenance policy', () => {
  const { weeklyTaskCounts } = loadPresentation();
  assert.deepEqual(
    weeklyTaskCounts({ overdue: 2, current: 3, due: [task('one'), task('two'), task('three'), task('four'), task('five')] }),
    { overdue: 2, current: 3, total: 5 },
  );
});

test('recognizes equipment completeness only when every required count is present', () => {
  const { isEquipmentComplete } = loadPresentation();
  assert.equal(isEquipmentComplete(task('complete', { coolerCount: 0, towerCount: 1, tapCount: 2, smarttapCount: 3 })), true);
  assert.equal(isEquipmentComplete(task('missing', { coolerCount: 0, towerCount: 1, tapCount: null, smarttapCount: 3 })), false);
});

test('presents the backend location boundaries at 250 metres and 80 metres accuracy', () => {
  const { locationPresentationState } = loadPresentation();
  const canonical = { canonicalLatitude: 38.4, canonicalLongitude: 27.1 };

  assert.equal(locationPresentationState({ ...canonical, distanceMeters: 250, accuracyMeters: 80 }), 'READY');
  assert.equal(locationPresentationState({ ...canonical, distanceMeters: 250.01, accuracyMeters: 80 }), 'REVIEW_REQUIRED');
  assert.equal(locationPresentationState({ ...canonical, distanceMeters: 250, accuracyMeters: 80.01 }), 'REVIEW_REQUIRED');
  assert.equal(locationPresentationState({ ...canonical, distanceMeters: 250, accuracyMeters: Number.NaN }), 'REVIEW_REQUIRED');
  assert.equal(locationPresentationState({ ...canonical, distanceMeters: 250, accuracyMeters: Number.POSITIVE_INFINITY }), 'REVIEW_REQUIRED');
  assert.equal(locationPresentationState({ distanceMeters: 10, accuracyMeters: 10 }), 'CANONICAL_LOCATION_MISSING');
});
