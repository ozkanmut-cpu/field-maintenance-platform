import * as assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./operations.tsx', import.meta.url), 'utf8');

test('dashboard loads an admin technician daily summary by technician and date', () => {
  assert.match(source, /admin-technician-daily-summary\?technicianId=/);
  assert.match(source, /Teknisyen Günlük Özeti/);
  assert.match(source, /Teknisyen seç/);
  assert.match(source, /Teknisyen özet tarihi/);
});

test('technician daily summary exposes own work, help separation, paperwork and activity detail', () => {
  assert.match(source, /Kendi bakımı/);
  assert.match(source, /Yardım verdi/);
  assert.match(source, /Yardım aldı/);
  assert.match(source, /Servis fişi/);
  assert.match(source, /Gün içi hareketler/);
});

test('technician daily summary clears stale data and reloads on technician, date or dashboard activation changes', () => {
  assert.match(source, /async function loadTechnicianDailySummary[\s\S]*setTechnicianDailySummary\(null\)[\s\S]*setTechnicianDailySummaryLoading\(true\)/);
  assert.match(source, /\[technicianDailySummaryTechnicianId, technicianDailySummaryDate, activeSection\]/);
});
