import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('primary mobile navigation exposes only Jobs, Customers and History', () => {
  const source = readFileSync(new URL('./mobile-navigation.ts', import.meta.url), 'utf8');
  const tabs = [...source.matchAll(/\{ screen: '([^']+)', label: '([^']+)'/g)]
    .map(([, screen, label]) => ({ screen, label }));

  assert.deepEqual(tabs, [
    { screen: 'TASKS', label: 'İşler' },
    { screen: 'CUSTOMERS', label: 'Müşterilerim' },
    { screen: 'HISTORY', label: 'Geçmiş' },
  ]);
});
