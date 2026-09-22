import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./paperwork-management.tsx', import.meta.url), 'utf8');

test('paperwork decisions are single-record only', () => {
  assert.doesNotMatch(source, /setSelected|toggleAll|bulkUpdate|paperwork\/bulk/i);
  assert.match(source, /body: JSON\.stringify\(\{ visitId, kind: action\.kind, status: action\.status, note: action\.note \}\)/);
  assert.match(source, /setVisits\(\(current\) => current\.map\(\(visit\) => visit\.id === visitId/);
});

test('changing the remote dataset invalidates prior rows and audit', () => {
  assert.match(source, /function invalidateList\(\)[\s\S]{0,700}setVisits\(\[\]\);[\s\S]{0,300}setHistoryVisitId\(''\)/);
  assert.match(source, /aria-label="Evrak bitiş tarihi"[\s\S]{0,250}invalidateList\(\)/);
  assert.match(source, /aria-label="Evrak teknisyeni filtresi"[\s\S]{0,250}invalidateList\(\)/);
});
