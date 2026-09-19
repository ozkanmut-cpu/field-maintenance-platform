import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');
test('setup pending queue links each reason to point detail rather than editing inline', () => {
  assert.match(source, /onNavigate\('point-detail'/);
  assert.doesNotMatch(source, /onClick=\{\(\) => void fixSetup/);
  assert.doesNotMatch(source, /async function fixSetup/,
    'The read-only queue must not retain an unused inline correction path');
  assert.match(source, /SMARTCLEAN_WEEK_MISSING/,
    'The UI must preserve the backend-emitted SmartClean week reason');
  assert.match(source, /onNavigate\('regions'\)/,
    'Missing technicians must lead to region technician assignment, not a point override');
  assert.match(source, /onNavigate\('duplicates'\)/,
    'Duplicate codes must lead to the real duplicate-review UI rather than a fake code editor');
});