import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');

test('dashboard loads a weekly period summary and exposes the selected week range', () => {
  assert.match(source, /admin-period-summary\?date=/);
  assert.match(source, /Haftalık \/ Dönem Sonu Özeti/);
  assert.match(source, /weekStart/);
  assert.match(source, /weekEnd/);
});

test('period summary supports previous and next week navigation with technician detail', () => {
  assert.match(source, /ÖNCEKİ HAFTA/);
  assert.match(source, /SONRAKİ HAFTA/);
  assert.match(source, /Teknisyen haftalık dağılımı/);
  assert.match(source, /Bekleyen evrak/);
});

test('period summary clears stale data and reloads whenever its date or dashboard activation changes', () => {
  assert.match(source, /async function loadPeriodSummary[\s\S]*setPeriodSummary\(null\)[\s\S]*setPeriodSummaryLoading\(true\)/);
  assert.match(source, /\[periodSummaryDate, activeSection\]/);
});

test('current week cannot navigate into a future week', () => {
  assert.match(source, /disabled=\{shiftDateKey\(periodSummaryDate, 7\) > istanbulDateKey\(\)\}/);
});
