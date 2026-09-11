import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TechnicianBaselineService } from './technician-baseline.service';
import { FeatureSnapshot, FeatureValue } from './feature-store.types';

const service = new TechnicianBaselineService();
function snap(week: number, features: Record<string, FeatureValue>): FeatureSnapshot {
  return {
    weekKey: `2026-W${week}`, isoYear: 2026, isoWeek: week,
    weekStart: `2026-02-${String(week).padStart(2, '0')}`, weekEnd: `2026-02-${String(week + 6).padStart(2, '0')}`,
    startInstant: new Date().toISOString(), endExclusiveInstant: new Date().toISOString(), sourceDataThrough: null,
    sourceHash: String(week), generatedAt: new Date().toISOString(),
    records: [{ entityType: 'TECHNICIAN', entityId: 't1', features }],
  };
}

test('stays warming up without enough equipment-complete weeks', () => {
  const profile = service.assessTechnician([1,2,3].map((w) => snap(w, { completedVisitCount: 5, equipmentSnapshotCoverage: 1, servicedCoolerCount: 10 })), 't1');
  assert.equal(profile.state, 'WARMING_UP');
  assert.equal(profile.serviceEvidenceWeeks, 3);
});

test('builds multivariate service baseline without collapsing to point count', () => {
  const history = [1,2,3,4].map((w) => snap(w, { completedVisitCount: 5 + w, uniqueVisitedPointCount: 5 + w, equipmentSnapshotCoverage: 1, servicedCoolerCount: 10 * w, servicedTowerCount: 2 * w, servicedTapCount: 8 * w, servicedSmarttapCount: w }));
  const profile = service.assessTechnician(history, 't1');
  assert.equal(profile.state, 'ACTIVE');
  assert.equal(profile.service.coolerCount.median, 25);
  assert.equal(profile.context.uniqueVisitedPoints.median, 7.5);
});

test('keeps travel baseline separate from service baseline', () => {
  const history = [1,2,3,4].map((w) => snap(w, { completedVisitCount: 6, equipmentSnapshotCoverage: 1, servicedCoolerCount: 12, servicedTowerCount: 3, servicedTapCount: 9, servicedSmarttapCount: 2, fieldRouteDistanceMeters: 10000 * w, fieldP90RadiusMeters: 3000 * w }));
  const profile = service.assessTechnician(history, 't1');
  assert.equal(profile.travel.routeDistanceMeters.median, 25000);
  assert.equal(profile.travelEvidenceWeeks, 4);
});
