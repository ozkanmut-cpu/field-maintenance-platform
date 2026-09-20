import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const app = (name) => new URL(`./${name}`, import.meta.url);

test('shared admin tables expose a keyboard-focusable scrolling region and caption', () => {
  const componentPath = app('accessible-table.tsx');
  assert.equal(existsSync(componentPath), true);
  const source = readFileSync(componentPath, 'utf8');
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /role="region"/);
  assert.match(source, /<caption/);
});

test('high-traffic admin tables use the shared accessible table wrapper', () => {
  for (const name of ['point-list.tsx', 'bulk-operations.tsx', 'paperwork-management.tsx', 'audit-log.tsx', 'anomaly-review.tsx']) {
    assert.match(readFileSync(app(name), 'utf8'), /AccessibleTable/);
  }
});

test('bulk and paperwork selection controls have names', () => {
  const bulk = readFileSync(app('bulk-operations.tsx'), 'utf8');
  const paperwork = readFileSync(app('paperwork-management.tsx'), 'utf8');
  assert.match(bulk, /noktasını seç/);
  assert.match(paperwork, /Görünen bakım kayıtlarının tümünü seç/);
  assert.match(paperwork, /bakım kaydını seç/);
  assert.match(paperwork, /Evrak kayıtlarında ara/);
});
