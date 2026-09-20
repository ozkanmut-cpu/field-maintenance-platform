import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./ai-dashboard.tsx', import.meta.url), 'utf8');

test('AI dashboard keeps the production backend contract and core decision-support sections', () => {
  assert.match(source, /\/api\/backend\/ai\/admin-dashboard\?weeks=12/);
  assert.match(source, /\/api\/backend\/ai\/kpi-report\?weeks=12/);
  for (const label of [
    'Sanal İstatistikçi', 'Teknisyen Kapasitesi', 'Servis iş yükü indeksi', 'AI Tarihsel Karşılaştırma',
    'Bölge Sağlığı', 'Geçmiş Risk Backtest', 'Veri Kalitesi Öncelik Kuyruğu',
    'Kalibrasyon ve Drift', 'AI Çalışma Sağlığı', 'AI Çıktı Dağılım Drift', 'Benzer Haftalar', 'AI Planlama Önerileri', 'Nokta Zorluk Profili',
  ]) assert.ok(source.includes(label), `missing dashboard section: ${label}`);
});

test('AI dashboard renders explainability and version fields', () => {
  assert.ok(source.includes('engineVersion'));
  assert.ok(source.includes('reasonCodes'));
  assert.ok(source.includes('confidence'));
});

test('AI dashboard ignores a superseded dashboard response', () => {
  assert.match(source, /const loadSequence = useRef\(0\)/);
  assert.match(source, /const requestId = \+\+loadSequence\.current/);
  assert.match(source, /requestId !== loadSequence\.current/);
});

test('AI dashboard has a retryable initial-load alert and isolates secondary action failures', () => {
  assert.match(source, /const \[loadError, setLoadError\] = useState\(''\)/);
  assert.match(source, /const \[actionError, setActionError\] = useState\(''\)/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Tekrar dene/);
  assert.doesNotMatch(source, /async function downloadKpi\(\) \{\s*setKpiBusy\(true\); setLoadError\(''\)/);
  assert.doesNotMatch(source, /async function sendFeedback[\s\S]*?setLoadError\(/);
});
