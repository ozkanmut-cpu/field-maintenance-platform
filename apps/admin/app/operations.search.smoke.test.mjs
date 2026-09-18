import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');

test('admin point search includes former-name aliases', () => {
  assert.match(source, /type Point = \{[\s\S]*aliases\?: string\[\]/);
  assert.match(source, /\.\.\.\(point\.aliases \?\? \[\]\)/);
});
