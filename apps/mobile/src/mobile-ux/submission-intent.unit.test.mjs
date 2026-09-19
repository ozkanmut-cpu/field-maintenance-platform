import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./submission-intent.ts', import.meta.url);

function loadSubmissionIntent() {
  assert.ok(fs.existsSync(filename), 'submission intent helper must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('an identical logical retry reuses the exact frozen request payload', () => {
  const { SubmissionIntentStore } = loadSubmissionIntent();
  const store = new SubmissionIntentStore();
  const intent = { pointId: 'point-1', reason: 'BUSINESS_CLOSED', note: 'Kapalı' };
  const payload = {
    ...intent,
    latitude: 38.423734,
    locationCapturedAt: '2026-09-18T10:15:30.000Z',
    idempotencyKey: 'attempt-key-1',
  };

  const stored = store.remember(intent, payload);

  assert.equal(store.retryPayload({ ...intent }), stored);
  assert.equal(store.retryPayload({ ...intent }).idempotencyKey, 'attempt-key-1');
  assert.equal(store.retryPayload({ ...intent }).locationCapturedAt, '2026-09-18T10:15:30.000Z');
  assert.equal(Object.isFrozen(stored), true);
});

test('editing a logical submit intent invalidates its payload and idempotency key', () => {
  const { SubmissionIntentStore } = loadSubmissionIntent();
  const store = new SubmissionIntentStore();
  store.remember(
    { pointId: 'point-1', tapCount: 4 },
    { pointId: 'point-1', tapCount: 4, idempotencyKey: 'maintenance-key-1' },
  );

  assert.equal(store.retryPayload({ pointId: 'point-1', tapCount: 5 }), null);
  assert.equal(store.retryPayload({ pointId: 'point-1', tapCount: 4 }), null);
});

test('an edit queued during a deferred write cannot clear its retry payload', async () => {
  const { SubmissionIntentStore } = loadSubmissionIntent();
  const store = new SubmissionIntentStore();
  const intent = { pointId: 'point-1', tapCount: 4 };
  const stored = store.remember(intent, {
    ...intent,
    locationCapturedAt: '2026-09-18T10:15:30.000Z',
    idempotencyKey: 'maintenance-key-1',
  });
  let resolveRequest;
  const request = new Promise(resolve => { resolveRequest = resolve; });
  let writeActive = true;

  assert.equal(store.clearIfIdle(writeActive), false);
  assert.equal(store.retryPayload({ ...intent }), stored);
  assert.equal(store.retryPayload({ ...intent }).idempotencyKey, 'maintenance-key-1');

  resolveRequest();
  await request;
  writeActive = false;
  assert.equal(store.clearIfIdle(writeActive), true);
  assert.equal(store.retryPayload({ ...intent }), null);
});
