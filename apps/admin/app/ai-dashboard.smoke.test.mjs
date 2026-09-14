import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./ai-dashboard.tsx', import.meta.url), 'utf8');

test('AI dashboard keeps the production backend contract and core decision-support sections', () => {
  assert.match(source, /\/api\/backend\/ai\/admin-dashboard\?weeks=12/);
  for (const label of [
    'Sanal İstatistikçi', 'Teknisyen Kapasitesi', 'AI Tarihsel Karşılaştırma',
    'Bölge Sağlığı', 'Geçmiş Risk Backtest', 'Veri Kalitesi Öncelik Kuyruğu',
    'Kalibrasyon ve Drift', 'AI Çalışma Sağlığı', 'AI Çıktı Dağılım Drift', 'Benzer Haftalar', 'AI Planlama Önerileri', 'Nokta Zorluk Profili',
  ]) assert.ok(source.includes(label), `missing dashboard section: ${label}`);
});

test('AI dashboard renders explainability and version fields', () => {
  assert.ok(source.includes('engineVersion'));
  assert.ok(source.includes('reasonCodes'));
  assert.ok(source.includes('confidence'));
});
