import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./location-matching.tsx', import.meta.url), 'utf8');

test('SAP / Google comparison keeps matching separate from point-detail navigation', () => {
  assert.match(source, /onNavigate:\s*\(section: AdminSection, values\?: Omit<AdminLocation, 'section'>\) => void/,
    'the comparison screen must receive the shell navigation contract');
  assert.match(source, /onNavigate\('point-detail', \{ pointId: point\.id \}\)/,
    'each matched point must offer the real point detail flow');
  assert.match(source, />DETAY<\/button>/,
    'the comparison table must expose a visible detail action');
  assert.match(source, /address-discovery/,
    'existing real matching operations must remain available');
});
