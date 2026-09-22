import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

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

test('dashboard preserves exactly three priority slots with card-level loading and retry states', () => {
  const prioritySection = source.match(/<section className="metricGrid dashboardQueueMetrics"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.equal((prioritySection.match(/className="dashboardPriorityState"/g) ?? []).length, 3);
  assert.doesNotMatch(prioritySection, /className="metricCard dashboardPriorityState"/,
    'loaded priority cards must not be nested inside a second metric-card surface');
  assert.equal((prioritySection.match(/<MetricCard/g) ?? []).length, 3);
  assert.match(styles, /\.dashboardPriorityState>\.metricCard,\.dashboardPriorityState>\.adminListState\{width:100%;height:100%\}/);
  assert.match(prioritySection, /Ayar bekleyenler ekranını aç/);
  assert.match(prioritySection, /Yapılamadı onaylarını aç/);
  assert.match(prioritySection, /Bakım takviminde gecikenleri aç/);
  assert.match(prioritySection, /onRetry=\{\(\) => void load\(\)\}/);
  assert.match(prioritySection, /onRetry=\{\(\) => void loadDailySummary\(\)\}/);
  assert.doesNotMatch(prioritySection, /value=\{[^}]*'—'/,
    'loading counters must not masquerade as a dash value');
});

test('dashboard reports are closed by default and toggle without an empty panel shell', () => {
  assert.match(source, /const \[dashboardReportsOpen, setDashboardReportsOpen\] = useState\(false\)/);
  assert.match(source, /Raporları ve ayrıntıları göster/);
  assert.match(source, /Raporları ve ayrıntıları gizle/);
  assert.match(source, /\{dashboardReportsOpen \? <div className="dashboardReports">/);
  assert.doesNotMatch(source, /<details className="panel dashboardReports">/);
});
