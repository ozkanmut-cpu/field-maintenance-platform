import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./toast-lifecycle.ts', import.meta.url);

function loadLifecycle() {
  assert.ok(fs.existsSync(filename), 'toast lifecycle helper must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('replacing a toast cancels the stale timer and only the current message dismisses', () => {
  const { scheduleToastDismiss } = loadLifecycle();
  const callbacks = new Map();
  const cleared = [];
  let nextId = 0;
  const timers = {
    setTimeout(callback) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      callbacks.delete(id);
    },
  };
  const dismissed = [];

  const cancelFirst = scheduleToastDismiss('İlk', () => dismissed.push('İlk'), 4000, timers);
  cancelFirst();
  scheduleToastDismiss('İkinci', () => dismissed.push('İkinci'), 4000, timers);
  callbacks.get(2)();

  assert.deepEqual(cleared, [1]);
  assert.deepEqual(dismissed, ['İkinci']);
});
