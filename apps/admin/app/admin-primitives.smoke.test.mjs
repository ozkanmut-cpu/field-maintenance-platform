import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const dependencyBase = process.env.FMP_DEPENDENCY_ROOT
  ? new URL(`file://${process.env.FMP_DEPENDENCY_ROOT.replace(/\/$/, '')}/package.json`)
  : import.meta.url;
const require = createRequire(dependencyBase);
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('./admin-primitives.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
new Function('require', 'exports', code)(require, exports);
const tableCode = ts.transpileModule(readFileSync(new URL('./accessible-table.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const tableExports = {};
new Function('require', 'exports', tableCode)(require, tableExports);

test('metric cards name the real count and navigate to their declared workflow', () => {
  const destinations = [];
  const card = exports.MetricCard({ label: 'Bekleyen onay', value: 7, description: 'Kayıtları incele',
    section: 'approvals', onNavigate: section => destinations.push(section) });
  assert.equal(card.type, 'button');
  assert.equal(card.props['aria-label'], 'Bekleyen onay: 7. Kayıtları incele');
  card.props.onClick();
  assert.deepEqual(destinations, ['approvals']);
});

test('filter toolbar exposes active filters, result count, clear and refresh actions', () => {
  const actions = [];
  const toolbar = exports.AdminFilterToolbar({ activeFilters: [{ id: 'status', label: 'Durum: Bekliyor' }], resultCount: 38,
    lastUpdated: '06:22', onClear: () => actions.push('clear'), onRefresh: () => actions.push('refresh'), children: 'filters' });
  assert.equal(toolbar.type, 'section');
  assert.equal(toolbar.props['aria-label'], 'Liste filtreleri');
  const children = toolbar.props.children;
  assert.equal(children[1].props.children[0].props.children.join(''), '38 kayıt');
  children[1].props.children[2].props.onClick();
  children[2].props.children[0].props.onClick();
  assert.deepEqual(actions, ['refresh', 'clear']);
});

test('list state uses live status semantics and exposes a local retry action', () => {
  let retried = false;
  const state = exports.AdminListState({ state: 'error', title: 'Kayıtlar alınamadı', description: 'Bağlantıyı kontrol edin.', onRetry: () => { retried = true; } });
  assert.equal(state.props.role, 'alert');
  assert.equal(state.props['aria-live'], 'assertive');
  state.props.children[2].props.onClick();
  assert.equal(retried, true);
});

test('panel primitive gives its content an accessible visible heading', () => {
  const panel = exports.AdminPanel({ title: 'Son kararlar', titleId: 'recent-decisions', children: 'content' });
  assert.equal(panel.type, 'section');
  assert.equal(panel.props['aria-labelledby'], 'recent-decisions');
  assert.equal(panel.props.children[0].props.children[0].props.children[0].props.children, 'Son kararlar');
});

test('responsive table names its scroll region and advertises sticky columns', () => {
  const table = tableExports.AccessibleTable({ caption: 'Nokta listesi', stickyColumns: 2, children: 'rows' });
  assert.equal(table.props.role, 'region');
  assert.match(table.props['aria-label'], /Nokta listesi/);
  assert.equal(table.props['data-sticky-columns'], 2);
  assert.equal(table.props.children.props['aria-label'], 'Nokta listesi');
});
