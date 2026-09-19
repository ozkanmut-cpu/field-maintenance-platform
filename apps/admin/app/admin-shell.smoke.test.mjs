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

test('shell provides a keyboard-dismissible text navigation drawer on compact screens', () => {
  const source = readFileSync(shellPath, 'utf8');
  assert.match(source, /isDrawerOpen/);
  assert.match(source, /aria-controls="admin-navigation-drawer"/);
  assert.match(source, /aria-modal=\{isCompact && isDrawerOpen \? true/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /button:not\(:disabled\):not\(\.collapseControl\)/);
  assert.match(source, /Menüyü Aç/);
});

test('shell adds accessible names and captions to shared table wrappers', () => {
  const source = readFileSync(shellPath, 'utf8');
  assert.match(source, /tableWrap/);
  assert.match(source, /tabIndex/);
  assert.match(source, /aria-label/);
  assert.match(source, /createElement\('caption'\)/);
  assert.match(source, /querySelector\('thead th'\)/);
  assert.match(source, /prefers-reduced-motion/);
});
