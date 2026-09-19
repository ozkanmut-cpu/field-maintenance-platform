import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./non-maintenance-visits.tsx', import.meta.url), 'utf8');

test('non-maintenance visits ignore stale load responses', () => {
  assert.match(source, /useRef/);
  assert.match(source, /const loadRequestId = useRef\(0\)/);
  assert.match(source, /const requestId = \+\+loadRequestId\.current/);
  assert.match(source, /loadRequestId\.current === requestId/);
});

test('non-maintenance visits abort the previous request before a refresh', () => {
  assert.match(source, /AbortController/);
  assert.match(source, /requestController\.current\?\.abort\(\)/);
  assert.match(source, /fetch\(path, \{ signal \}\)/);
});
