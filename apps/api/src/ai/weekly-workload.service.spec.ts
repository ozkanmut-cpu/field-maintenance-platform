import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { TechnicianWeeklyBaseline } from './technician-baseline.types';
import { WeeklyWorkloadService } from './weekly-workload.service';

const service = new WeeklyWorkloadService();

function assigned(overrides: Partial<TechnicianAssignedWeeklyWorkload>): TechnicianAssignedWeeklyWorkload {
  return {
    technicianId: 't1',
    standardCurrent: 0,
    standardCarryover: 0,
    smartcleanCurrent: 0,
    smartcleanCarryover: 0,
    equipmentKnownPointCount: 0,
    equipmentUnknownPointCount: 0,
    assignedCoolerCount: 0,
    assignedTowerCount: 0,
    assignedTapCount: 0,
    assignedSmarttapCount: 0,
    assignedLocatedPointCount: 0,
    assignedUnlocatedPointCount: 0,
    assignedFieldP90RadiusMeters: null,
    assignedRouteEstimateMeters: null,
    assignedRouteCoherenceRatio: null,
    assignedClusterCount: 0,
    assignedIsolatedPointCount: 0,
    assignedFragmentationRatio: null,
    workAreaCenterDistanceMeters: null,
    ...overrides,
  };
}

function baseline(state: 'WARMING_UP' | 'ACTIVE'): TechnicianWeeklyBaseline {
  return {
    technicianId: 't1',
    state,
    confidence: state === 'ACTIVE' ? 'MEDIUM' : 'LOW',
    observedWeeks: state === 'ACTIVE' ? 8 : 2,
    serviceEvidenceWeeks: state === 'ACTIVE' ? 8 : 2,
    travelEvidenceWeeks: state === 'ACTIVE' ? 4 : 1,
    service: {
      completedVisits: { median: 10, p75: 12, p90: 14 },
      coolerCount: { median: 20, p75: 24, p90: 28 },
      towerCount: { median: 8, p75: 10, p90: 12 },
      tapCount: { median: 6, p75: 8, p90: 10 },
      smarttapCount: { median: 2, p75: 3, p90: 4 },
    },
    travel: {
      routeDistanceMeters: { median: 10000, p75: 15000, p90: 20000 },
      fieldP90RadiusMeters: { median: 5000, p75: 7000, p90: 9000 },
      routeCoherenceRatio: { median: 1.2, p75: 1.5, p90: 2 },
      fragmentationRatio: { median: 0.2, p75: 0.4, p90: 0.6 },
    },
    context: { uniqueVisitedPoints: { median: 9, p75: 11, p90: 13 } },
    reasons: state === 'ACTIVE' ? [] : ['SERVICE_HISTORY_TOO_SHORT'],
  };
}

test('compares complete assigned equipment and geography against learned baseline bands', () => {
  const result = service.assess(
    assigned({
      standardCurrent: 3,
      smartcleanCurrent: 2,
      equipmentKnownPointCount: 5,
      assignedCoolerCount: 29,
      assignedTowerCount: 11,
      assignedTapCount: 7,
      assignedSmarttapCount: 3,
      assignedLocatedPointCount: 5,
      assignedFieldP90RadiusMeters: 8000,
      assignedRouteEstimateMeters: 18000,
    }),
    baseline('ACTIVE'),
  );

  assert.equal(result.evidenceState, 'READY');
  assert.equal(result.servicePressure.coolerCount, 'ABOVE_P90');
  assert.equal(result.servicePressure.towerCount, 'ABOVE_P75');
  assert.equal(result.servicePressure.tapCount, 'WITHIN_BASELINE');
  assert.equal(result.servicePressure.smarttapCount, 'WITHIN_BASELINE');
  assert.equal(result.travelPressure.fieldP90RadiusMeters, 'ABOVE_P75');
  assert.equal(result.travelPressure.routeDistanceMeters, 'ABOVE_P75');
  assert.deepEqual(result.reasons, []);
});

test('brakes equipment pressure when any assigned point has an incomplete profile', () => {
  const result = service.assess(
    assigned({ standardCurrent: 3, equipmentKnownPointCount: 2, equipmentUnknownPointCount: 1, assignedCoolerCount: 40 }),
    baseline('ACTIVE'),
  );
  assert.equal(result.servicePressure.coolerCount, 'UNKNOWN');
  assert.ok(result.reasons.includes('ASSIGNED_EQUIPMENT_PROFILE_INCOMPLETE'));
});

test('brakes geographic pressure when an assigned point lacks canonical location', () => {
  const result = service.assess(
    assigned({ standardCurrent: 2, equipmentKnownPointCount: 2, assignedLocatedPointCount: 1, assignedUnlocatedPointCount: 1, assignedFieldP90RadiusMeters: 12000 }),
    baseline('ACTIVE'),
  );
  assert.equal(result.travelPressure.fieldP90RadiusMeters, 'UNKNOWN');
  assert.ok(result.reasons.includes('ASSIGNED_LOCATION_PROFILE_INCOMPLETE'));
});

test('keeps assessment insufficient while baseline is warming up', () => {
  const result = service.assess(
    assigned({ standardCurrent: 1 }),
    baseline('WARMING_UP'),
  );

  assert.equal(result.evidenceState, 'INSUFFICIENT_DATA');
  assert.equal(result.baselineConfidence, 'LOW');
  assert.deepEqual(result.reasons, [
    'SERVICE_HISTORY_TOO_SHORT',
    'BASELINE_NOT_ACTIVE',
    'ASSIGNED_EQUIPMENT_LOAD_NOT_AVAILABLE',
    'ASSIGNED_TRAVEL_LOAD_NOT_AVAILABLE',
    'ASSIGNED_ROUTE_ESTIMATE_NOT_AVAILABLE',
  ]);
});
