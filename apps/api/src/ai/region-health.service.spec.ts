import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RegionHealthService } from './region-health.service';
import { FeatureSnapshot } from './feature-store.types';

const service = new RegionHealthService();
const snap = (week: number, features: Record<string, any>): FeatureSnapshot => ({
  weekKey: `2026-W${String(week).padStart(2,'0')}`,
  isoYear: 2026,
  isoWeek: week,
  weekStart: '2026-01-01',
  weekEnd: '2026-01-07',
  startInstant: '2026-01-01T00:00:00Z',
  endExclusiveInstant: '2026-01-08T00:00:00Z',
  sourceDataThrough: null,
  sourceHash: String(week),
  generatedAt: '2026-01-08T00:00:00Z',
  records: [{ entityType: 'REGION', entityId: 'r1', features }],
});
test('region health degrades for carryover, poor location coverage and high attempts', () => {
  const [row] = service.assess([
    snap(1, { pointCount: 20, locationCoverage: .9, visitCount: 20, attemptCount: 1, smartcleanCarryoverWorkloadCount: 0, geographicFragmentationRatio: .1 }),
    snap(2, { pointCount: 20, locationCoverage: .3, visitCount: 10, attemptCount: 6, smartcleanCarryoverWorkloadCount: 3, geographicFragmentationRatio: .7 }),
  ]);
  assert.equal(row.state, 'RED');
  assert.equal(row.trend, 'WORSENING');
  assert.ok(row.reasonCodes.includes('REGION_SMARTCLEAN_CARRYOVER'));
});

test('healthy region stays green when rule bands are clean', () => {
  const [row] = service.assess([
    snap(1, { pointCount: 10, locationCoverage: .95, visitCount: 20, attemptCount: 1, smartcleanCarryoverWorkloadCount: 0, geographicFragmentationRatio: .1 }),
  ]);
  assert.equal(row.state, 'GREEN');
  assert.ok(row.reasonCodes.includes('REGION_HEALTH_WITHIN_RULE_BANDS'));
});
