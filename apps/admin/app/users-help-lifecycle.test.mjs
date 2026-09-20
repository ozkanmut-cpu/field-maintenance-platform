import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHelpLocationLifecycle, createRequestGate, isActiveTechnician } from './users-help-lifecycle.js';

test('help request gate rejects a stale response or error after a newer deep link request', () => {
  const gate = createRequestGate();
  const first = gate.begin();
  const second = gate.begin();

  assert.equal(gate.isCurrent(first), false, 'an older request must not update the visible editor or error');
  assert.equal(gate.isCurrent(second), true);
});

test('an immediately fulfilled help request from A cannot mutate state or restore A after route transition to B', async () => {
  for (const transitionKind of ['navigate', 'popstate']) {
    const lifecycle = createHelpLocationLifecycle();
    let visibleHelper = '';
    let urlHelper = 'A';

    lifecycle.transition();
    const request = lifecycle.begin();
    const response = Promise.resolve({ helperId: 'A' });

    // Both transitions invalidate synchronously, before React can run effects.
    urlHelper = 'B';
    lifecycle.transition();

    const data = await response;
    if (lifecycle.isCurrent(request)) {
      visibleHelper = data.helperId;
      urlHelper = data.helperId;
    }

    assert.equal(visibleHelper, '', `${transitionKind}: stale A must not update the Help editor`);
    assert.equal(urlHelper, 'B', `${transitionKind}: stale A must not navigate the URL back to A`);
  }
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
  assert.match(source, /helpLocationLifecycle\.current\.isCurrent\(request\)/);
  assert.match(source, /helpLocationLifecycle\.current\.transition\(\);/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /\(\) => helpRequestAbort\.current\?\.abort\(\)/);
  assert.match(source, /role="alert"/);
});
