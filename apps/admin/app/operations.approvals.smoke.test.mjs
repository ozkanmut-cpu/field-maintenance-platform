import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');

test('attempt approvals keep the real decision workflow in an operational review layout', () => {
  assert.match(source, /Bekleyen Yapılamadı Onayları/);
  assert.match(source, /await api\('\/api\/backend\/maintenance\/attempt-review'/);
  assert.match(source, /Onaylanan görev kapanır; reddedilen görev açık kalır\./);
  assert.match(source, /Bekleyen kayıtlar/);
  assert.match(source, /Son Yapılamadı Kararları/);
  assert.match(source, /loading \? '—' : reviewedAttemptCounts\.approved/,
    'review history counts must stay unknown while the real queue is loading');
});

test('attempt approvals ignore stale queue refreshes after an admin decision', () => {
  assert.match(source, /useRef/,
    'the review queue needs a persistent request generation between refreshes');
  assert.match(source, /const loadGeneration = useRef\(0\);/);
  assert.match(source, /const generation = \+\+loadGeneration\.current;/);
  assert.match(source, /if \(generation !== loadGeneration\.current\) return;/,
    'an older queue response must not restore a decision that the later refresh removed');
  assert.match(source, /if \(generation === loadGeneration\.current\) setLoading\(false\);/,
    'only the active refresh may settle the queue loading state');
});
