import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const historyFile = new URL('./history.ts', import.meta.url);

function loadHistory() {
  assert.ok(fs.existsSync(historyFile), 'history helper must exist');
  const source = fs.readFileSync(historyFile, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

const item = (id, type, overrides = {}) => ({
  id,
  type,
  at: '2026-09-16T09:00:00.000Z',
  ...overrides,
});

test('builds Monday-Sunday week ranges from Europe/Istanbul rather than the device timezone', () => {
  const { historyRangeFor } = loadHistory();
  const istanbulMonday = new Date('2026-09-06T21:00:00.000Z');
  const priorIstanbulSunday = new Date('2026-09-06T20:59:59.999Z');

  assert.deepEqual(historyRangeFor('THIS_WEEK', undefined, istanbulMonday), {
    from: '2026-09-07', to: '2026-09-13',
  });
  assert.deepEqual(historyRangeFor('LAST_WEEK', undefined, istanbulMonday), {
    from: '2026-08-31', to: '2026-09-06',
  });
  assert.deepEqual(historyRangeFor('THIS_WEEK', undefined, priorIstanbulSunday), {
    from: '2026-08-31', to: '2026-09-06',
  });
});

test('date selection accepts only real YYYY-MM-DD business dates', () => {
  const { historyRangeFor, isBusinessDateKey } = loadHistory();

  assert.deepEqual(historyRangeFor('DATE', '2028-02-29'), { from: '2028-02-29', to: '2028-02-29' });
  assert.equal(isBusinessDateKey('2028-02-29'), true);
  for (const invalid of ['2026-02-30', '2026-9-1', '01.09.2026', '', '0001-01-01', '9999-12-31']) {
    assert.equal(isBusinessDateKey(invalid), false);
    assert.throws(() => historyRangeFor('DATE', invalid), /geçerli bir tarih/i);
  }
});

test('a draft date request does not replace the applied period until a successful commit', () => {
  const { HistoryRequestCoordinator } = loadHistory();
  const coordinator = new HistoryRequestCoordinator({ period: 'LAST_WEEK', date: '2026-09-06' });

  const request = coordinator.begin({ period: 'DATE', date: '2026-09-18' });
  assert.deepEqual(coordinator.applied, { period: 'LAST_WEEK', date: '2026-09-06' });

  assert.deepEqual(coordinator.commit(request), { period: 'DATE', date: '2026-09-18' });
  assert.deepEqual(coordinator.applied, { period: 'DATE', date: '2026-09-18' });
});

test('an older history request cannot commit after a newer request starts', () => {
  const { HistoryRequestCoordinator } = loadHistory();
  const coordinator = new HistoryRequestCoordinator({ period: 'THIS_WEEK', date: '2026-09-18' });

  const older = coordinator.begin({ period: 'LAST_WEEK', date: '2026-09-18' });
  const newer = coordinator.begin({ period: 'THIS_WEEK', date: '2026-09-18' });

  assert.equal(coordinator.isCurrent(older), false);
  assert.equal(coordinator.isCurrent(newer), true);
  assert.deepEqual(coordinator.commit(newer), { period: 'THIS_WEEK', date: '2026-09-18' });
  assert.equal(coordinator.commit(older), null);
  assert.deepEqual(coordinator.applied, { period: 'THIS_WEEK', date: '2026-09-18' });
});

test('retry keeps the latest failed custom range without replacing the applied range', () => {
  const { HistoryRequestCoordinator } = loadHistory();
  const coordinator = new HistoryRequestCoordinator({ period: 'LAST_WEEK', date: '2026-09-06' });

  const failedCustom = coordinator.begin({ period: 'DATE', date: '2026-09-18' });
  assert.deepEqual(coordinator.fail(failedCustom), { period: 'DATE', date: '2026-09-18' });
  assert.deepEqual(coordinator.retry, { period: 'DATE', date: '2026-09-18' });
  assert.deepEqual(coordinator.applied, { period: 'LAST_WEEK', date: '2026-09-06' });

  const retry = coordinator.begin(coordinator.retry);
  assert.equal(coordinator.fail(failedCustom), null);
  assert.deepEqual(coordinator.applied, { period: 'LAST_WEEK', date: '2026-09-06' });
  assert.deepEqual(coordinator.commit(retry), { period: 'DATE', date: '2026-09-18' });
  assert.equal(coordinator.retry, null);
});

test('history filters expose only operation kinds and help that exist in the real response', () => {
  const { availableHistoryFilters, filterHistoryItems } = loadHistory();
  const items = [
    item('maintenance', 'MAINTENANCE'),
    item('attempt', 'ATTEMPT', { assistedForTechnician: { id: 'tech-2', name: 'Zeynep', username: 'zeynep' } }),
    item('prospect', 'PROSPECT_VISIT'),
  ];

  assert.deepEqual(availableHistoryFilters(items).map(option => option.value), [
    'ALL', 'MAINTENANCE', 'ATTEMPT', 'PROSPECT_VISIT', 'HELP',
  ]);
  assert.deepEqual(filterHistoryItems(items, 'ATTEMPT').map(value => value.id), ['attempt']);
  assert.deepEqual(filterHistoryItems(items, 'HELP').map(value => value.id), ['attempt']);
  assert.equal(availableHistoryFilters(items).some(option => option.value === 'NON_MAINTENANCE_VISIT'), false);
  assert.equal(availableHistoryFilters(items.slice(0, 1)).some(option => option.value === 'HELP'), false);
});
