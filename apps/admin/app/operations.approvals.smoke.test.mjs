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
