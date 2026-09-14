import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { CapabilityMaturity } from './data-maturity.types';
import { RiskEngineService } from './risk-engine.service';
import { TechnicianWeeklyBaseline } from './technician-baseline.types';
import { WeeklyWorkloadAssessment } from './weekly-workload.types';

const service = new RiskEngineService();
const maturity: CapabilityMaturity = { capability: 'RISK', state: 'ACTIVE', score: 70, qualityScore: 80, reasons: [] };
const assigned = (overrides: Partial<TechnicianAssignedWeeklyWorkload> = {}): TechnicianAssignedWeeklyWorkload => ({
  technicianId: 't1', standardCurrent: 4, standardCarryover: 0, smartcleanCurrent: 1, smartcleanCarryover: 0,
  equipmentKnownPointCount: 5, equipmentUnknownPointCount: 0, assignedCoolerCount: 20, assignedTowerCount: 8,
  assignedTapCount: 6, assignedSmarttapCount: 2, assignedLocatedPointCount: 5, assignedUnlocatedPointCount: 0,
  assignedFieldP90RadiusMeters: 5000, assignedRouteEstimateMeters: 12000, assignedRouteCoherenceRatio: 1.2,
  assignedClusterCount: 1, assignedIsolatedPointCount: 0, assignedFragmentationRatio: 0.2, workAreaCenterDistanceMeters: 1000, ...overrides,
});
const baseline: TechnicianWeeklyBaseline = {
  technicianId: 't1', state: 'ACTIVE', confidence: 'MEDIUM', observedWeeks: 8, serviceEvidenceWeeks: 8, travelEvidenceWeeks: 6,
  service: {
    completedVisits: { median: 8, p75: 10, p90: 12 }, coolerCount: { median: 20, p75: 25, p90: 30 },
    towerCount: { median: 8, p75: 10, p90: 12 }, tapCount: { median: 6, p75: 8, p90: 10 }, smarttapCount: { median: 2, p75: 3, p90: 4 },
  },
  travel: { routeDistanceMeters: { median: 10000, p75: 15000, p90: 20000 }, fieldP90RadiusMeters: { median: 5000, p75: 7000, p90: 9000 }, routeCoherenceRatio: { median: 1.2, p75: 1.5, p90: 2 }, fragmentationRatio: { median: 0.2, p75: 0.4, p90: 0.6 } },
  context: { uniqueVisitedPoints: { median: 8, p75: 10, p90: 12 }, paperworkCompletionMinutes: { median: 60, p75: 120, p90: 240 }, suspiciousVisitRate: { median: 0, p75: 0, p90: 0.1 }, lateEntryMinutes: { median: 0, p75: 10, p90: 30 } }, reasons: [],
};
const workload = (serviceBand: 'WITHIN_BASELINE' | 'ABOVE_P75' | 'ABOVE_P90' | 'UNKNOWN', geoBand: 'WITHIN_BASELINE' | 'ABOVE_P75' | 'ABOVE_P90' | 'UNKNOWN' = 'WITHIN_BASELINE'): WeeklyWorkloadAssessment => ({
  technicianId: 't1', evidenceState: 'READY', baselineState: 'ACTIVE', baselineConfidence: 'MEDIUM',
  assigned: { standardCurrent: 4, standardCarryover: 0, smartcleanCurrent: 1, smartcleanCarryover: 0 },
  servicePressure: { coolerCount: serviceBand, towerCount: 'WITHIN_BASELINE', tapCount: 'WITHIN_BASELINE', smarttapCount: 'WITHIN_BASELINE' },
  travelPressure: { routeDistanceMeters: 'UNKNOWN', fieldP90RadiusMeters: geoBand, routeCoherenceRatio: 'WITHIN_BASELINE', fragmentationRatio: 'WITHIN_BASELINE', workAreaProximity: 'WITHIN_BASELINE' }, reasons: [],
});

test('maturity gate prevents a confident risk when the risk capability is not active', () => {
  const result = service.assessTechnician(assigned(), baseline, workload('ABOVE_P90'), { ...maturity, state: 'WARMING_UP' });
  assert.equal(result.state, 'INSUFFICIENT_DATA');
  assert.equal(result.severity, 'UNKNOWN');
  assert.ok(result.reasons.includes('RISK_MATURITY_GATE_NOT_READY'));
});

test('equipment service pressure above p90 becomes a high explainable risk signal', () => {
  const result = service.assessTechnician(assigned(), baseline, workload('ABOVE_P90'), maturity);
  assert.equal(result.state, 'READY');
  assert.equal(result.severity, 'HIGH');
  assert.equal(result.signals[0].code, 'SERVICE_LOAD_ABOVE_P90');
});

test('carryover is contextual risk and becomes high only above learned completion p75', () => {
  const medium = service.assessTechnician(assigned({ standardCarryover: 2 }), baseline, workload('WITHIN_BASELINE'), maturity);
  const high = service.assessTechnician(assigned({ standardCarryover: 11 }), baseline, workload('WITHIN_BASELINE'), maturity);
  assert.equal(medium.severity, 'MEDIUM');
  assert.equal(high.severity, 'HIGH');
  assert.ok(high.signals.some((signal) => signal.code === 'CARRYOVER_ABOVE_COMPLETION_P75'));
});


test('route pressure contributes an explainable technician risk signal', () => {
  const w = workload('WITHIN_BASELINE');
  w.travelPressure.routeDistanceMeters = 'ABOVE_P90';
  const result = service.assessTechnician(assigned({ assignedRouteEstimateMeters: 25000 }), baseline, w, maturity);
  assert.equal(result.severity, 'HIGH');
  assert.ok(result.signals.some((signal) => signal.code === 'ROUTE_BURDEN_ABOVE_P90'));
});

test('point risk exposes repeated attempt risk without inventing a score when evidence is ready', () => {
  const profile: any = {
    pointId: 'p1', state: 'ACTIVE', confidence: 'MEDIUM', score: 50, equipmentProfileComplete: true,
    equipmentProfile: { confidence: 'HIGH', anomalyCodes: [], confidenceScore: 90 },
    equipment: { coolerCount: 2, towerCount: 1, tapCount: 3, smarttapCount: 0 },
    geography: { located: true, isolated: false, nearestNeighborMeters: 100 },
    history: { visits: 1, attempts: 3, missed: 0, completed: 1, observedPeriods: 1 }, reasons: [],
  };
  const result = service.assessPoint(profile, maturity);
  assert.equal(result.state, 'READY');
  assert.equal(result.severity, 'HIGH');
  assert.ok(result.signals.some((signal) => signal.code === 'REPEATED_ATTEMPTS_DOMINATE_VISITS'));
});


test('period-end capacity excess creates explicit delay and overload signals', () => {
  const result = service.assessTechnician(assigned({ standardCurrent: 13, smartcleanCurrent: 1 }), baseline, workload('WITHIN_BASELINE'), maturity);
  assert.equal(result.severity, 'HIGH');
  assert.ok(result.signals.some((signal) => signal.code === 'PERIOD_END_DELAY_RISK_HIGH'));
  assert.ok(result.signals.some((signal) => signal.code === 'TECHNICIAN_OVERLOAD'));
});

test('SmartClean carryover is surfaced as an overdue window risk', () => {
  const result = service.assessTechnician(assigned({ smartcleanCarryover: 1 }), baseline, workload('WITHIN_BASELINE'), maturity);
  assert.ok(result.signals.some((signal) => signal.code === 'SMARTCLEAN_WINDOW_OVERDUE'));
});


test('suspicious batch evidence is surfaced as an explainable geography risk signal', () => {
  const result = service.assessTechnician(assigned({ currentWeekSuspiciousVisitCount: 1, currentWeekReviewRecommendedCount: 1 }), baseline, workload('WITHIN_BASELINE'), maturity);
  assert.ok(result.signals.some((signal) => signal.code === 'SUSPICIOUS_TRAVEL_OR_BATCH_EVIDENCE'));
});

test('paperwork completion time is compared with learned technician baseline', () => {
  const result = service.assessTechnician(assigned({ currentWeekPaperworkCompletionP90Minutes: 300 }), baseline, workload('WITHIN_BASELINE'), maturity);
  assert.equal(result.severity, 'HIGH');
  assert.ok(result.signals.some((signal) => signal.code === 'PAPERWORK_COMPLETION_ABOVE_P90'));
});
