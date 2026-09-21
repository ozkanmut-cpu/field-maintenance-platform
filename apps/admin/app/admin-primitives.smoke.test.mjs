import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('./admin-primitives.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
new Function('require', 'exports', code)(require, exports);

test('metric cards name the real count and navigate to their declared workflow', () => {
  const destinations = [];
  const card = exports.MetricCard({ label: 'Bekleyen onay', value: 7, description: 'Kayıtları incele',
    section: 'approvals', onNavigate: section => destinations.push(section) });
  assert.equal(card.type, 'button');
  assert.equal(card.props['aria-label'], 'Bekleyen onay: 7. Kayıtları incele');
  card.props.onClick();
  assert.deepEqual(destinations, ['approvals']);
});
