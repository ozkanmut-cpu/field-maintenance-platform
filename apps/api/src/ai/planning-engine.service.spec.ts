import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PlanningEngineService, PlanningTechnicianInput } from './planning-engine.service';
import { CapabilityMaturity } from './data-maturity.types';

const service = new PlanningEngineService();
const maturity: CapabilityMaturity = { capability: 'RECOMMENDATION', state: 'ACTIVE', score: 70, qualityScore: 80, reasons: [] };
function input(overrides: any = {}): PlanningTechnicianInput {
  return {
    technicianId: 't1',
    assigned: {
      technicianId: 't1', standardCurrent: 4, standardCarryover: 0, smartcleanCurrent: 1, smartcleanCarryover: 0,
      equipmentKnownPointCount: 5, equipmentUnknownPointCount: 0, assignedCoolerCount: 20, assignedTowerCount: 8,
      assignedTapCount: 6, assignedSmarttapCount: 2, assignedLocatedPointCount: 5, assignedUnlocatedPointCount: 0,
      assignedFieldP90RadiusMeters: 5000, assignedRouteEstimateMeters: 12000, assignedRouteCoherenceRatio: 1.2,
      assignedClusterCount: 1, assignedIsolatedPointCount: 0, assignedFragmentationRatio: 0.2, workAreaCenterDistanceMeters: 1000,
      ...overrides.assigned,
    },
    workload: {
      technicianId: 't1', evidenceState: 'READY', baselineState: 'ACTIVE', baselineConfidence: 'MEDIUM',
      assigned: { standardCurrent: 4, standardCarryover: 0, smartcleanCurrent: 1, smartcleanCarryover: 0 },
      servicePressure: { coolerCount: 'WITHIN_BASELINE', towerCount: 'WITHIN_BASELINE', tapCount: 'WITHIN_BASELINE', smarttapCount: 'WITHIN_BASELINE' },
      travelPressure: { routeDistanceMeters: 'WITHIN_BASELINE', fieldP90RadiusMeters: 'WITHIN_BASELINE', routeCoherenceRatio: 'WITHIN_BASELINE', fragmentationRatio: 'WITHIN_BASELINE', workAreaProximity: 'WITHIN_BASELINE' }, reasons: [],
      ...overrides.workload,
    },
    risk: { technicianId: 't1', engineVersion: 'test', state: 'READY', severity: 'LOW', confidence: 'MEDIUM', signals: [], reasons: [], ...overrides.risk },
  } as PlanningTechnicianInput;
}

test('maturity gate suppresses recommendations instead of inventing advice', () => {
  const result = service.assess([input()], { ...maturity, state: 'WARMING_UP' });
  assert.equal(result.state, 'INSUFFICIENT_DATA');
  assert.deepEqual(result.recommendations, []);
});

test('carryover and high risk generate ranked explainable recommendations without applying changes', () => {
  const result = service.assess([input({ assigned: { standardCarryover: 4 }, risk: { severity: 'HIGH', reasons: ['SERVICE_LOAD_ABOVE_P90'] } })], maturity);
  assert.equal(result.state, 'READY');
  assert.equal(result.recommendations[0].type, 'REVIEW_WORKLOAD_BALANCE');
  assert.ok(result.recommendations.some((item) => item.type === 'PRIORITIZE_CARRYOVER'));
  assert.ok(result.recommendations.every((item) => item.constraints.includes('NO_AUTOMATIC_OPERATIONAL_CHANGE')));
});

test('route pressure produces route review while incomplete profiles produce data-quality review', () => {
  const result = service.assess([input({ assigned: { equipmentUnknownPointCount: 1 }, workload: { travelPressure: { routeDistanceMeters: 'ABOVE_P90', fieldP90RadiusMeters: 'WITHIN_BASELINE', routeCoherenceRatio: 'WITHIN_BASELINE', fragmentationRatio: 'WITHIN_BASELINE', workAreaProximity: 'WITHIN_BASELINE' } } })], maturity);
  assert.ok(result.recommendations.some((item) => item.type === 'REVIEW_ROUTE'));
  assert.ok(result.recommendations.some((item) => item.type === 'FIX_DATA_QUALITY'));
});
