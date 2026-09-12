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
    },
    context: { uniqueVisitedPoints: { median: 9, p75: 11, p90: 13 } },
    reasons: state === 'ACTIVE' ? [] : ['SERVICE_HISTORY_TOO_SHORT'],
  };
}

test('marks assessment ready when technician baseline is active', () => {
  const result = service.assess(
    assigned({ standardCurrent: 3, standardCarryover: 1, smartcleanCurrent: 2, smartcleanCarryover: 1 }),
    baseline('ACTIVE'),
  );

  assert.equal(result.evidenceState, 'READY');
  assert.deepEqual(result.assigned, {
    standardCurrent: 3,
    standardCarryover: 1,
    smartcleanCurrent: 2,
    smartcleanCarryover: 1,
  });
  assert.equal(result.servicePressure.coolerCount, 'UNKNOWN');
  assert.equal(result.travelPressure.routeDistanceMeters, 'UNKNOWN');
  assert.deepEqual(result.reasons, [
    'ASSIGNED_EQUIPMENT_LOAD_NOT_AVAILABLE',
    'ASSIGNED_TRAVEL_LOAD_NOT_AVAILABLE',
  ]);
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
  ]);
});
