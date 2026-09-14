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
  assignedFieldP90RadiusMeters: 5000, ...overrides,
});
const baseline: TechnicianWeeklyBaseline = {
  technicianId: 't1', state: 'ACTIVE', confidence: 'MEDIUM', observedWeeks: 8, serviceEvidenceWeeks: 8, travelEvidenceWeeks: 6,
  service: {
    completedVisits: { median: 8, p75: 10, p90: 12 }, coolerCount: { median: 20, p75: 25, p90: 30 },
    towerCount: { median: 8, p75: 10, p90: 12 }, tapCount: { median: 6, p75: 8, p90: 10 }, smarttapCount: { median: 2, p75: 3, p90: 4 },
  },
  travel: { routeDistanceMeters: { median: 10000, p75: 15000, p90: 20000 }, fieldP90RadiusMeters: { median: 5000, p75: 7000, p90: 9000 } },
  context: { uniqueVisitedPoints: { median: 8, p75: 10, p90: 12 } }, reasons: [],
};
const workload = (serviceBand: 'WITHIN_BASELINE' | 'ABOVE_P75' | 'ABOVE_P90' | 'UNKNOWN', geoBand: 'WITHIN_BASELINE' | 'ABOVE_P75' | 'ABOVE_P90' | 'UNKNOWN' = 'WITHIN_BASELINE'): WeeklyWorkloadAssessment => ({
  technicianId: 't1', evidenceState: 'READY', baselineState: 'ACTIVE', baselineConfidence: 'MEDIUM',
  assigned: { standardCurrent: 4, standardCarryover: 0, smartcleanCurrent: 1, smartcleanCarryover: 0 },
  servicePressure: { coolerCount: serviceBand, towerCount: 'WITHIN_BASELINE', tapCount: 'WITHIN_BASELINE', smarttapCount: 'WITHIN_BASELINE' },
  travelPressure: { routeDistanceMeters: 'UNKNOWN', fieldP90RadiusMeters: geoBand }, reasons: [],
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
