import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');
test('setup pending queue links each reason to point detail rather than editing inline', () => {
  assert.match(source, /onNavigate\('point-detail'/);
  assert.doesNotMatch(source, /onClick=\{\(\) => void fixSetup/);
});
