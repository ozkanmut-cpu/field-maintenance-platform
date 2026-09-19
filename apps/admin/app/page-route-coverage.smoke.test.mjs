import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

assert.match(page, /section === 'kpi-reporting'\s*\?\s*<KpiReportingPanel/,
  'KPI navigation must render the real KPI reporting panel');
assert.match(page, /section === 'technician-daily-summary'\s*\?\s*<TechnicianDailySummaryPanel/,
  'Technician summary navigation must render its real panel');
assert.match(page, /section === 'users' \|\| section === 'help-targets'/,
  'Help targets navigation must render the existing help authorisation workflow');
assert.doesNotMatch(page, /KULLANICI ÖZETİ/,
  'Dashboard must lead with real operational data instead of a user-count summary band');

console.log('page route coverage smoke test passed');
