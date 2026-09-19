import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./duplicate-suggestions.tsx', import.meta.url), 'utf8');

test('duplicate candidates allow separate read-only detail review for both points', () => {
  assert.match(source, /onNavigate:\s*\(section: AdminSection, values\?: Omit<AdminLocation, 'section'>\) => void/,
    'the duplicate review must use the shell navigation contract');
  assert.match(source, /onNavigate\('point-detail', \{ pointId: item\.left\.id \}\)/,
    'the left candidate must open its actual point detail');
  assert.match(source, /onNavigate\('point-detail', \{ pointId: item\.right\.id \}\)/,
    'the right candidate must open its actual point detail');
  assert.doesNotMatch(source, /\/merge\b/,
    'the review UI must not offer an automatic merge operation');
});
