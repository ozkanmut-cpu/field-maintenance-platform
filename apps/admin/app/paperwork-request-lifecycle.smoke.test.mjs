import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./paperwork-management.tsx', import.meta.url), 'utf8');

test('paperwork visits ignore an older refresh and retain selection only for the matching dataset', () => {
  assert.match(source, /const visitsRequests = useRef\(new RequestActivity\(setVisitsBusy\)\)/,
    'visit loads need their own request activity lane');
  assert.match(source, /const requestEpoch = visitsRequests\.current\.begin\(\)/,
    'every visit refresh must supersede the prior request');
  assert.match(source, /if \(!visitsRequests\.current\.isCurrent\(requestEpoch\)\) return;/,
    'an older visit response must not replace a newer filter or refresh');
  assert.match(source, /const sameDataset = visitsDatasetKeyRef\.current === datasetKey[\s\S]{0,500}setSelected\(\(current\) => sameDataset \? current\.filter\(\(id\) => itemIds\.has\(id\)\) : \[\]\)/,
    'selection may survive only a refresh of the same technician/date dataset');
});

test('paperwork filters invalidate selection and an open history request', () => {
  assert.match(source, /function invalidateVisitContext\(\)[\s\S]{0,700}visitsRequests\.current\.invalidate\(\);[\s\S]{0,250}historyRequests\.current\.invalidate\(\)/,
    'filter changes must reset both in-flight visit and history lanes');
  assert.match(source, /setSelected\(\[\]\);[\s\S]{0,250}setHistoryVisitId\(''\);[\s\S]{0,250}setHistory\(\[\]\)/,
    'filter changes must synchronously remove selection and history');
  assert.match(source, /const requestEpoch = historyRequests\.current\.begin\(\)[\s\S]{0,900}if \(!historyRequests\.current\.isCurrent\(requestEpoch\)\) return;[\s\S]{0,500}historyRequests\.current\.finish\(requestEpoch\)/,
    'a closed or invalidated history view must ignore its old response');
});

test('paperwork busy state is owned by visit, history, and mutation lanes', () => {
  assert.match(source, /const \[mutationBusy, setMutationBusy\] = useState\(false\);[\s\S]{0,150}const \[visitsBusy, setVisitsBusy\] = useState\(false\);[\s\S]{0,150}const \[historyBusy, setHistoryBusy\] = useState\(false\);/,
    'independent work must not share one reset-prone busy flag');
  assert.match(source, /const busy = mutationBusy \|\| visitsBusy \|\| historyBusy;/,
    'controls remain disabled whenever any active lane still owns work');
  assert.match(source, /historyRequests\.current\.invalidate\(\); setHistoryVisitId\('',?\); setHistory\(\[\]\);/,
    'search and close must synchronously release their history activity lane');
});

test('paperwork analytics ignores stale filter and refresh responses', () => {
  assert.match(source, /const analyticsRequests = useRef\(new LatestRequest\(\)\)/,
    'analytics needs its own request lane');
  assert.match(source, /const requestEpoch = analyticsRequests\.current\.next\(\)[\s\S]{0,1300}if \(!analyticsRequests\.current\.isCurrent\(requestEpoch\)\) return;/,
    'older analytics responses must not overwrite the newer date/technician result');
});
