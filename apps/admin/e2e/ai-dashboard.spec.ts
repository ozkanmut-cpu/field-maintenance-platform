import { expect, test } from '@playwright/test';

const dashboard = {
  weeks: 12,
  currentWeek: '2026-W37',
  generatedAt: '2026-09-14T12:00:00.000Z',
  engineVersion: 'field-stat-v1.2',
  featureSchemaVersion: '2026-09-14.2',
  maturity: {
    overallState: 'ACTIVE', overallScore: 82,
    evidence: { weeks: 12, visits: 120, attempts: 8, activePoints: 40, locatedPoints: 38, locationCoverage: 0.95, equipmentProfileCoverage: 0.9 },
    capabilities: [{ capability: 'RISK', state: 'ACTIVE', score: 82, qualityScore: 90, reasons: [] }],
  },
  dataQuality: { score: 91, confidence: 'HIGH', reasonCodes: [], issues: [] },
  unassigned: { standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0 },
  technicians: [], pointDifficulty: [], similarWeeks: [], regionHealth: [],
  planning: { state: 'READY', reasons: [], recommendations: [] },
  backtest: { state: 'READY', evaluatedPredictions: 10, skippedPredictions: 0, truePositive: 3, falsePositive: 1, trueNegative: 5, falseNegative: 1, precision: 0.75, recall: 0.75, accuracy: 0.8, reasonCodes: [] },
  trends: { weekly: [{ weekKey: '2026-W37', maturityScore: 82, dataQualityScore: 91, locationCoverage: 0.95, equipmentCoverage: 0.9 }], regions: [], technicians: [], points: [] },
  calibration: { confidence: 'MEDIUM', reasonCodes: [], equipment: [], travel: [], drift: [] },
  telemetry: { operations: [{ operation: 'admin-dashboard', count: 3, errorCount: 0, errorRate: 0, averageDurationMs: 25, p95DurationMs: 31, maxDurationMs: 31, lastDurationMs: 24 }] },
  outputDistributionDrift: { observationCount: 4, state: 'STABLE', maxAbsoluteDelta: 0.04, risk: { LOW: 0.1 }, recommendation: {}, reasonCodes: ['AI_OUTPUT_DISTRIBUTION_STABLE'] },
};
const admin = { id: 'admin-1', name: 'Admin User', username: 'admin', role: 'ADMIN', active: true };

test('AI dashboard renders through the real browser shell and exports KPI CSV', async ({ page }) => {
  await page.route('**/api/session/me', (route) => route.fulfill({ json: admin }));
  await page.route('**/api/backend/users', (route) => route.fulfill({ json: [admin] }));
  await page.route('**/api/backend/ai/admin-dashboard?weeks=12', (route) => route.fulfill({ json: dashboard }));
  await page.route('**/api/backend/ai/kpi-report?weeks=12', (route) => route.fulfill({
    json: { filename: 'ai-kpi-2026-W37.csv', contentType: 'text/csv;charset=utf-8', content: 'section;metric;value\nSYSTEM;overallMaturity;82' },
  }));

  await page.goto('/');
  await page.getByRole('button', { name: 'Sanal İstatistikçi', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Sanal İstatistikçi' }).first()).toBeVisible();
  await expect(page.getByText('AI olgunluk skoru')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI Çıktı Dağılım Drift' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Geçmiş Risk Backtest' })).toBeVisible();
  await expect(page.getByText('field-stat-v1.2')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'KPI CSV' }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toBe('ai-kpi-2026-W37.csv');
});
