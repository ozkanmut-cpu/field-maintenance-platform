import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const primitivesPath = new URL('./admin-primitives.tsx', import.meta.url);
const operationsPath = new URL('./operations.tsx', import.meta.url);

test('dashboard queue metrics use the reusable accessible MetricCard destinations', () => {
  assert.equal(existsSync(primitivesPath), true, 'shared dashboard primitives must exist');
  const primitives = readFileSync(primitivesPath, 'utf8');
  const operations = readFileSync(operationsPath, 'utf8');

  assert.match(primitives, /export function MetricCard/);
  assert.match(primitives, /aria-label/);
  assert.match(operations, /import \{ MetricCard \} from '\.\/admin-primitives'/);
  assert.match(operations, /<MetricCard[\s\S]*section="setup-pending"/);
  assert.match(operations, /<MetricCard[\s\S]*section="approvals"/);
  assert.match(operations, /<MetricCard[\s\S]*section="points"/);
  assert.match(operations, /<MetricCard[\s\S]*section="regions"/);
});
