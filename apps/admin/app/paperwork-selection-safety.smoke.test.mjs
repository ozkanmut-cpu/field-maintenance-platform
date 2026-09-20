import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./paperwork-management.tsx', import.meta.url), 'utf8');

test('bulk paperwork actions exclude selections hidden by search', () => {
  assert.match(source, /const actionableSelected = selected\.filter\(\(id\) => visible\.some\(\(visit\) => visit\.id === id\)\)/,
    'bulk actions must be derived from the current visible set');
  assert.match(source, /setSelected\(\[\]\); setSearch\(e\.target\.value\)/,
    'a search change must synchronously clear prior selections');
  assert.match(source, /onChange=\{\(e\) => \{ invalidateVisitContext\(\); setTechnicianId\(e\.target\.value\); \}\}/,
    'a technician change must synchronously invalidate the prior selection context');
  assert.match(source, /onChange=\{\(e\) => \{ invalidateVisitContext\(\); setDate\(e\.target\.value\); \}\}/,
    'a date change must synchronously invalidate the prior selection context');
  assert.match(source, /actionableSelected\.map\(\(visitId\)/,
    'the bulk request must never submit stale hidden visit ids');
  assert.doesNotMatch(source, /body: JSON\.stringify\(\{ items: selected\.map\(/,
    'the raw selected state is unsafe as a bulk request payload');
});
