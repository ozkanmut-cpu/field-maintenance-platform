import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequestGate, isActiveTechnician } from './users-help-lifecycle.js';

test('help request gate rejects a stale response or error after a newer deep link request', () => {
  const gate = createRequestGate();
  const first = gate.begin();
  const second = gate.begin();

  assert.equal(gate.isCurrent(first), false, 'an older request must not update the visible editor or error');
  assert.equal(gate.isCurrent(second), true);
});

test('help deep links only accept an active technician as the selected helper', () => {
  const users = [
    { id: 'admin', role: 'ADMIN', active: true },
    { id: 'inactive-tech', role: 'TECHNICIAN', active: false },
    { id: 'active-tech', role: 'TECHNICIAN', active: true },
  ];

  assert.equal(isActiveTechnician(users, 'admin'), false);
  assert.equal(isActiveTechnician(users, 'inactive-tech'), false);
  assert.equal(isActiveTechnician(users, 'active-tech'), true);
});

test('users refresh retains the signed-in session and help requests are abortable and error-safe', () => {
  const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  assert.match(source, /setMe\(current\);\s*try\s*\{\s*await loadUsers\(\)/s);
  assert.match(source, /helpRequestAbort\.current\?\.abort\(\)/);
  assert.match(source, /helpRequestGate\.current\.isCurrent\(requestId\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /\(\) => helpRequestAbort\.current\?\.abort\(\)/);
  assert.match(source, /role="alert"/);
});
