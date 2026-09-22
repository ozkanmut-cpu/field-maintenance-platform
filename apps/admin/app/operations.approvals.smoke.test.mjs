import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');

test('attempt approvals keep the real decision workflow in an operational review layout', () => {
  assert.match(source, /Bekleyen Yapılamadı Onayları/);
  assert.match(source, /await api<[^>]+>\('\/api\/backend\/maintenance\/attempt-review'/);
  assert.match(source, /Onaylanan görev kapanır; reddedilen görev açık kalır\./);
  assert.match(source, /Bekleyen kayıtlar/);
  assert.match(source, /Son Yapılamadı Kararları/);
  assert.match(source, /AdminListState state="loading" title="Onay verileri yükleniyor"/,
    'review metrics must use the shared loading state while the real queue is loading');
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

test('attempt approvals expose priority, context and a required rejection reason', () => {
  assert.match(source, /const prioritizedAttemptQueue = useMemo/);
  assert.match(source, /En eski bekleyen/);
  assert.match(source, /Gecikmiş/);
  assert.match(source, /Tekrarlayan nokta/);
  assert.match(source, /Tekrarlayan teknisyen/);
  assert.match(source, /Nokta detayını aç/);
  assert.match(source, /Bakım bağlamını aç/);
  assert.match(source, /Ret nedeni \(zorunlu\)/);
  assert.match(source, /decision === 'REJECTED' && !note/);
});

test('attempt decision updates only the reviewed row and preserves accessible history', () => {
  const reviewBody = source.match(/async function reviewAttempt[\s\S]*?\n}\nasync function changePointStatus/)?.[0] ?? '';
  assert.match(reviewBody, /setAttemptQueue\(\(current\) => current\.filter/);
  assert.match(reviewBody, /setAttemptHistory\(\(current\) =>/);
  assert.doesNotMatch(reviewBody, /await load\(\)/,
    'a decision must not replace the whole queue with a global reload');
  assert.match(source, /aria-label="Son yapılamadı kararları"/);
});
