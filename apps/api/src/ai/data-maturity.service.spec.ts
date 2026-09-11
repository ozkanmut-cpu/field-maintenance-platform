import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataMaturityService } from './data-maturity.service';
import { FeatureSnapshot } from './feature-store.types';

function snapshot(week: number, overrides: Partial<Record<string, number>> = {}): FeatureSnapshot {
  const weekKey = `2026-W${String(week).padStart(2, '0')}`;
  const activePointCount = overrides.activePointCount ?? 100;
  const locatedPointCount = overrides.locatedPointCount ?? 90;
  const activeTechnicianCount = overrides.activeTechnicianCount ?? 8;
  const regionCount = overrides.regionCount ?? 12;
  const visitCount = overrides.visitCount ?? 80;
  const attemptCount = overrides.attemptCount ?? 8;
  return {
    weekKey,
    isoYear: 2026,
    isoWeek: week,
    weekStart: '2026-01-01',
    weekEnd: '2026-01-07',
    startInstant: '2026-01-01T00:00:00.000Z',
    endExclusiveInstant: '2026-01-08T00:00:00.000Z',
    sourceDataThrough: null,
    sourceHash: weekKey,
    generatedAt: '2026-01-01T00:00:00.000Z',
    records: [
      { entityType: 'SYSTEM', entityId: 'SYSTEM', features: {
        activePointCount, locatedPointCount, activeTechnicianCount, regionCount, visitCount, attemptCount, obligationCount: 0,
      }},
      { entityType: 'TECHNICIAN', entityId: 't1', features: {
        suspiciousVisitCount: overrides.suspiciousVisitCount ?? 1,
        reviewRecommendedCount: overrides.reviewRecommendedCount ?? 1,
      }},
    ],
  };
}

const service = new DataMaturityService();

test('empty history stays inactive', () => {
  const result = service.assess([]);
  assert.equal(result.overallState, 'INACTIVE');
  assert.equal(result.overallScore, 0);
  assert.equal(result.evidence.weeks, 0);
  assert.ok(result.capabilities.every((item) => item.state === 'INACTIVE'));
});

test('capabilities activate progressively as weekly evidence grows', () => {
  const short = service.assess([snapshot(1), snapshot(2)]);
  const medium = service.assess(Array.from({ length: 12 }, (_, i) => snapshot(i + 1)));
  const long = service.assess(Array.from({ length: 52 }, (_, i) => snapshot(i + 1)));

  const score = (name: string, result: ReturnType<DataMaturityService['assess']>) =>
    result.capabilities.find((item) => item.capability === name)!.score;

  assert.ok(score('CAPACITY', medium) > score('CAPACITY', short));
  assert.ok(score('RISK', medium) > score('RISK', short));
  assert.ok(score('SEASONALITY', long) > score('SEASONALITY', medium));
  assert.equal(long.capabilities.find((item) => item.capability === 'SEASONALITY')!.state, 'RELIABLE');
});

test('poor location coverage brakes geography and recommendation maturity', () => {
  const good = service.assess(Array.from({ length: 16 }, (_, i) => snapshot(i + 1)));
  const poor = service.assess(Array.from({ length: 16 }, (_, i) => snapshot(i + 1, { locatedPointCount: 10 })));

  const geoGood = good.capabilities.find((item) => item.capability === 'GEOGRAPHY')!;
  const geoPoor = poor.capabilities.find((item) => item.capability === 'GEOGRAPHY')!;
  const recGood = good.capabilities.find((item) => item.capability === 'RECOMMENDATION')!;
  const recPoor = poor.capabilities.find((item) => item.capability === 'RECOMMENDATION')!;

  assert.ok(geoPoor.score < geoGood.score);
  assert.ok(recPoor.score < recGood.score);
  assert.ok(geoPoor.reasons.some((reason) => reason.includes('%50')));
});

test('latest week is selected deterministically from unsorted history', () => {
  const result = service.assess([snapshot(9), snapshot(7), snapshot(8)]);
  assert.equal(result.latestWeekKey, '2026-W09');
  assert.equal(result.evidence.weeks, 3);
});
