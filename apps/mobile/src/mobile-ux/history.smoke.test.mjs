import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screenFile = new URL('./HistoryScreen.tsx', import.meta.url);
const helperFile = new URL('./history.ts', import.meta.url);
const appFile = new URL('../CorporateApp.tsx', import.meta.url);
const apiFile = new URL('../api.ts', import.meta.url);

function source(file) {
  assert.ok(fs.existsSync(file), `${file.pathname} must exist`);
  return fs.readFileSync(file, 'utf8');
}

test('history client sends a typed inclusive range to the real endpoint', () => {
  const api = source(apiFile);

  assert.match(api, /export type TechnicianHistoryQuery/);
  assert.match(api, /from: string/);
  assert.match(api, /to: string/);
  assert.match(api, /export type TechnicianHistoryResult/);
  assert.match(api, /technicianHistory\(query: TechnicianHistoryQuery = \{\}\)/);
  assert.match(api, /maintenance\/technician-history/);
  assert.match(api, /encodeURIComponent/);
});

test('history screen offers this week, last week, and a real date selection', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  for (const label of ['Bu Hafta', 'Geçen Hafta', 'Tarih Seç']) {
    assert.match(screen, new RegExp(label));
  }
  assert.match(screen, /onPeriodChange\('THIS_WEEK'\)/);
  assert.match(screen, /onPeriodChange\('LAST_WEEK'\)/);
  assert.match(screen, /onPeriodChange\('DATE'\)/);
  assert.match(screen, /accessibilityLabel="Geçmiş tarihi"/);
  assert.match(screen, /onApplyDate/);
  assert.match(app, /historyRangeFor\(period, selectedDate\)/);
  assert.match(app, /technicianHistory\(range\)/);
  assert.doesNotMatch(screen, /mock|fixture|synthetic/i);
});

test('history filters and labels are derived only from real endpoint item types', () => {
  const screen = source(screenFile);
  const helper = source(helperFile);

  assert.match(screen, /availableHistoryFilters\(items\)/);
  assert.match(screen, /filterHistoryItems\(items, filter\)/);
  for (const label of ['Bakım', 'Yapılamadı', 'Bakım dışı', 'Aday müşteri', 'Yardım']) {
    assert.match(`${screen}\n${helper}`, new RegExp(label));
  }
});

test('history keeps destructive revert confirmation and refreshes the selected real range', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /item\.type === 'MAINTENANCE'/);
  assert.match(screen, /onRevert\(item\)/);
  assert.match(app, /Alert\.alert\('Bakımı geri al'/);
  assert.match(app, /style: 'destructive'/);
  assert.match(app, /await revertMaintenance\(item\.id/);
  assert.match(app, /await loadHistory\(historyPeriod, historyDate\)/);
  assert.match(app, /catch \(e\) \{ setHistoryError\(message\(e\)\); \}/);
  assert.doesNotMatch(app, /Alert\.alert\('Geri alınamadı'/);
  assert.match(app, /accessibilityLabel="Geçmişi yenile"/);
});

test('history exposes revert only for maintenance entries from today or yesterday', () => {
  const screen = source(screenFile);
  const helper = source(helperFile);

  assert.match(screen, /canTechnicianRevertHistoryItem\(item\.at\)/);
  assert.match(helper, /export function canTechnicianRevertHistoryItem/);
});

test('editing a custom date does not change the active range until it is applied', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(app, /const \[historyDateDraft, setHistoryDateDraft\]/);
  assert.match(app, /const \[historyDatePickerVisible, setHistoryDatePickerVisible\]/);
  assert.match(app, /selectedDate=\{historyDateDraft\}/);
  assert.match(app, /onDateChange=\{setHistoryDateDraft\}/);
  assert.match(app, /if \(period === 'DATE'\) \{ setHistoryDatePickerVisible\(true\); return; \}/);
  assert.match(app, /onApplyDate=\{\(\) => void loadHistory\('DATE', historyDateDraft\)\}/);
  assert.match(app, /setHistoryPeriod\(applied\.period\)/);
  assert.match(app, /setHistoryDate\(applied\.date\)/);
  assert.match(screen, /datePickerVisible \? <View style=\{styles\.dateCard\}>/);
  assert.match(app, /await loadHistory\(historyPeriod, historyDate\)/);
});

test('switching back to a weekly history period closes the stale date chooser immediately', () => {
  const app = source(appFile);

  assert.match(app, /function selectHistoryPeriod\(period: HistoryPeriod\) \{[\s\S]*setHistoryDatePickerVisible\(false\);[\s\S]*setHistoryPeriod\(period\);[\s\S]*void loadHistory\(period, historyDate\);/);
});

test('only the latest overlapping history request can commit response, error, or loading state', () => {
  const app = source(appFile);

  assert.match(app, /const request = historyRequests\.current!\.begin/);
  assert.match(app, /const applied = historyRequests\.current!\.commit\(request\);\s*if \(!applied\) return;/);
  assert.match(app, /catch \(e\) \{\s*if \(historyRequests\.current!\.fail\(request\)\) setHistoryError/);
  assert.match(app, /finally \{\s*if \(historyRequests\.current!\.isCurrent\(request\)\) setHistoryLoading\(false\)/);
});

test('inline retry repeats the failed candidate while refresh keeps the applied range', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /onRetry: \(\) => void/);
  assert.match(screen, /accessibilityLabel="Geçmişi tekrar dene"[\s\S]*onPress=\{onRetry\}/);
  assert.match(app, /function retryHistory\(\)/);
  assert.match(app, /onRetry=\{retryHistory\}/);
  assert.match(app, /onRefresh=\{\(\) => void loadHistory\(historyPeriod, historyDate\)\}/);
});

test('history has inline loading, retry, empty, and pull-to-refresh states', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /Geçmiş yükleniyor/);
  assert.match(screen, /Geçmiş yüklenemedi/);
  assert.match(screen, /TEKRAR DENE/);
  assert.match(screen, /Bu dönemde işlem yok/);
  assert.match(app, /refreshing=\{historyLoading\}/);
  assert.match(app, /onRefresh=\{\(\) => void loadHistory\(historyPeriod, historyDate\)\}/);
});
