import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const shellPath = new URL('./admin-shell.tsx', import.meta.url);

test('shell exposes accessible grouped navigation and collapse control', () => {
  assert.equal(existsSync(shellPath), true);
  const source = readFileSync(shellPath, 'utf8');
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-current/);
  assert.match(source, /Menüyü Daralt/);
  assert.match(source, /localStorage/);
});
