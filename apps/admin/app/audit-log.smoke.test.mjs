import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const source = readFileSync(new URL('./audit-log.tsx', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

function auditModule() {
  const ts = require('typescript');
  const js = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const auditRequire = (id) => id === './admin-icons' ? { AdminIcon: () => null } : id === './accessible-table' ? { AccessibleTable: ({ children }) => children } : id === './admin-primitives' ? { AdminFilterToolbar: ({ children }) => children, AdminListState: () => null } : require(id);
  new Function('require', 'module', 'exports', js)(auditRequire, mod, mod.exports);
  return mod.exports;
}

test('audit filters are labelled and submit with the keyboard against the supported backend filters', () => {
  assert.match(source, /<form[^>]+onSubmit=/);
  for (const label of ['Audit kaydı ara', 'Entity tipi filtresi', 'İşlem filtresi', 'Kullanıcı filtresi']) {
    assert.match(source, new RegExp(`aria-label="${label}"`), label);
  }
  for (const parameter of ['entityType', 'action', 'actorId']) {
    assert.match(source, new RegExp(`params\\.set\\('${parameter}'`), parameter);
  }
});

test('audit details expose readable before and after JSON in separate disclosures', () => {
  assert.match(source, /<details/);
  assert.match(source, /<summary>Önceki değer<\/summary>/);
  assert.match(source, /<summary>Yeni değer<\/summary>/);
  assert.match(source, /JSON\.stringify\(selected\.oldValue \?\? null, null, 2\)/);
  assert.match(source, /JSON\.stringify\(selected\.newValue \?\? null, null, 2\)/);
});

test('audit refreshes abort and ignore stale responses, while detail focus is keyboard-safe', () => {
  assert.match(source, /requestControllerRef\.current\?\.abort\(\)/);
  assert.match(source, /const requestId = \+\+requestIdRef\.current/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /requestId !== requestIdRef\.current/);
  assert.match(source, /AbortError/);
  assert.match(source, /detailCloseRef\.current\?\.focus\(\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /auditDetailFocusTarget\(trigger, auditHeadingRef\.current\)/);
  assert.match(source, /<h2 ref=\{auditHeadingRef\} tabIndex=\{-1\}>İşlem Geçmişi<\/h2>/);
  assert.match(source, /focusAfterCloseRef\.current = 'fallback'/);
});

test('shown audit count explains client-side text filtering accurately', () => {
  assert.match(source, /auditShownCountLabel\(search, items\.length\)/);
  assert.match(source, /Yüklenen en fazla 300 kayıt içinde metin aramasına uyan kayıt/);
  assert.match(source, /Yüklenen \$\{loadedCount\} kaydın tamamı \(en fazla 300\)/);
  assert.match(source, /Sunucu filtresine uyan toplam kayıt/);
});

test('a refreshed audit dataset closes a detail that no longer exists', () => {
  const { reconcileAuditSelection } = auditModule();
  const selected = { id: 'removed' };
  assert.equal(reconcileAuditSelection(selected, [{ id: 'kept' }]), null);
  assert.equal(reconcileAuditSelection(selected, [{ id: 'removed' }]), selected);
  assert.equal(reconcileAuditSelection(null, [{ id: 'kept' }]), null);
});

test('shown count labels are bounded to the loaded 300-record dataset', () => {
  const { auditShownCountLabel } = auditModule();
  assert.equal(auditShownCountLabel('', 300), 'Yüklenen 300 kaydın tamamı (en fazla 300)');
  assert.equal(auditShownCountLabel('konum', 300), 'Yüklenen en fazla 300 kayıt içinde metin aramasına uyan kayıt');
});

test('audit default window covers previous and current week and date filtering is inclusive', () => {
  const { auditDefaultDateRange, filterAuditItems } = auditModule();
  assert.deepEqual(auditDefaultDateRange(new Date('2026-09-22T12:00:00.000Z')), { from: '2026-09-14', to: '2026-09-27' });
  const items = [
    { id: 'before', createdAt: '2026-09-13T23:59:59.000Z', actor: { id: '1', name: 'A', username: 'a', role: 'ADMIN' }, entityType: 'POINT', entityId: '1', action: 'EDIT' },
    { id: 'from', createdAt: '2026-09-14T00:00:00.000Z', actor: { id: '1', name: 'A', username: 'a', role: 'ADMIN' }, entityType: 'POINT', entityId: '1', action: 'EDIT' },
    { id: 'to', createdAt: '2026-09-27T23:59:59.000Z', actor: { id: '1', name: 'A', username: 'a', role: 'ADMIN' }, entityType: 'POINT', entityId: '1', action: 'EDIT' },
  ];
  assert.deepEqual(filterAuditItems(items, { search: '', from: '2026-09-14', to: '2026-09-27' }).map((item) => item.id), ['from', 'to']);
});

test('detail focus fallback is an enabled, connected audit heading while a refresh is busy', () => {
  const { auditDetailFocusTarget } = auditModule();
  const detachedTrigger = { isConnected: false, disabled: false, focus() {} };
  const busyRefreshButton = { isConnected: true, disabled: true, focus() { throw new Error('disabled refresh must not receive focus'); } };
  const stableHeading = { isConnected: true, focus() {} };
  assert.equal(auditDetailFocusTarget(detachedTrigger, stableHeading), stableHeading);
  assert.notEqual(auditDetailFocusTarget(detachedTrigger, stableHeading), busyRefreshButton);
});

test('reporting CI runs audit smoke when either audit source or test changes', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/reporting-ci.yml', import.meta.url), 'utf8');
  for (const path of ['apps/admin/app/audit-log.tsx', 'apps/admin/app/audit-log.smoke.test.mjs']) {
    assert.equal(workflow.split(`'${path}'`).length - 1, 2, `${path} must trigger push and pull-request validation`);
  }
  assert.match(workflow, /Reporting admin smoke[\s\S]*apps\/admin\/app\/audit-log\.smoke\.test\.mjs/);
});
