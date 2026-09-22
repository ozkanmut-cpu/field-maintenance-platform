import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./paperwork-management.tsx', import.meta.url), 'utf8');

test('paperwork visits ignore an older range refresh', () => {
  assert.match(source, /const visitsRequests = useRef\(new RequestActivity\(setVisitsBusy\)\)/);
  assert.match(source, /const requestEpoch = visitsRequests\.current\.begin\(\)/);
  assert.match(source, /if \(!visitsRequests\.current\.isCurrent\(requestEpoch\)\) return;/);
  assert.match(source, /visitsRequests\.current\.finish\(requestEpoch\)/);
});

test('paperwork range and technician changes invalidate list and audit context', () => {
  assert.match(source, /function invalidateList\(\)[\s\S]{0,700}visitsRequests\.current\.invalidate\(\);[\s\S]{0,250}historyRequests\.current\.invalidate\(\)/);
  assert.match(source, /setHistoryVisitId\(''\);[\s\S]{0,150}setHistory\(\[\]\)/);
  assert.match(source, /aria-label="Evrak başlangıç tarihi"[\s\S]{0,250}invalidateList\(\)/);
  assert.match(source, /aria-label="Evrak teknisyeni filtresi"[\s\S]{0,250}invalidateList\(\)/);
});

test('paperwork mutations use a row-owned busy and retry state', () => {
  assert.match(source, /const \[mutationVisitId, setMutationVisitId\] = useState\(''\)/);
  assert.match(source, /const \[rowErrors, setRowErrors\] = useState<Record<string, RowError>>\(\{\}\)/);
  assert.match(source, /const rowBusy = mutationVisitId === visit\.id/);
  assert.match(source, /rowErrors\[visit\.id\][\s\S]{0,350}Tekrar dene/);
});

test('paperwork history and analytics each reject stale responses', () => {
  assert.match(source, /const requestEpoch = historyRequests\.current\.begin\(\)[\s\S]{0,900}historyRequests\.current\.isCurrent\(requestEpoch\)/);
  assert.match(source, /const requestEpoch = analyticsRequests\.current\.next\(\)[\s\S]{0,1000}analyticsRequests\.current\.isCurrent\(requestEpoch\)/);
});
