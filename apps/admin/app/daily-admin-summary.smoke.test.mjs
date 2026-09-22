import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');

test('operations dashboard loads the admin daily summary for an Istanbul business date', () => {
  assert.match(source, /admin-daily-summary\?date=/);
  assert.match(source, /Günlük Operasyon Özeti/);
  assert.match(source, /Tamamlanan bakım/);
  assert.match(source, /Sahada çalışan teknisyen/);
});

test('daily admin summary dashboard exposes attention counts and technician detail', () => {
  assert.match(source, /Geciken açık iş/);
  assert.match(source, /Atanmamış açık iş/);
  assert.match(source, /Bekleyen evrak/);
  assert.match(source, /Teknisyen günlük dağılımı/);
  assert.match(source, /setupPending\.length/);
  assert.match(source, /attemptQueue\.length/);
});

test('daily summary clears stale data and refreshes whenever the dashboard becomes active again', () => {
  assert.match(source, /async function loadDailySummary[\s\S]*setDailySummary\(null\)[\s\S]*setDailySummaryLoading\(true\)/);
  assert.match(source, /if \(activeSection !== 'dashboard'\) return;/);
  assert.match(source, /\[dailySummaryDate, activeSection\]/);
});

test('dashboard keeps exactly three actionable priorities and uses shared loading states', () => {
  const prioritySection = source.match(/<section className="metricGrid dashboardQueueMetrics"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.equal((prioritySection.match(/<MetricCard/g) ?? []).length, 3);
  assert.match(prioritySection, /Ayar bekleyenler ekranını aç/);
  assert.match(prioritySection, /Yapılamadı onaylarını aç/);
  assert.match(prioritySection, /Bakım takviminde gecikenleri aç/);
  assert.match(source, /AdminListState/);
  assert.doesNotMatch(prioritySection, /value=\{[^}]*'—'/,
    'loading counters must not masquerade as a dash value');
});

test('dashboard reports remain visible instead of living in a blank collapsed container', () => {
  assert.doesNotMatch(source, /<details className="panel dashboardReports">/);
  assert.doesNotMatch(source, /<summary>Raporlar ve ayrıntılar<\/summary>/);
  assert.match(source, /<div className="dashboardReports">/);
});
