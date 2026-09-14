import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RiskEngineService } from './risk-engine.service';
import { WeeklyWorkloadService } from './weekly-workload.service';
import { WhatIfService } from './what-if.service';

const service = new WhatIfService(new WeeklyWorkloadService(), new RiskEngineService());
const maturity:any = { capability:'RISK', state:'ACTIVE', score:70, qualityScore:80, reasons:[] };
const baseline:any = { technicianId:'t1', state:'ACTIVE', confidence:'MEDIUM', observedWeeks:8, serviceEvidenceWeeks:8, travelEvidenceWeeks:6, service:{ completedVisits:{median:8,p75:10,p90:12}, coolerCount:{median:20,p75:25,p90:30}, towerCount:{median:8,p75:10,p90:12}, tapCount:{median:6,p75:8,p90:10}, smarttapCount:{median:2,p75:3,p90:4} }, travel:{ routeDistanceMeters:{median:10000,p75:15000,p90:20000}, fieldP90RadiusMeters:{median:5000,p75:7000,p90:9000}, routeCoherenceRatio:{median:1.2,p75:1.5,p90:2}, fragmentationRatio:{median:0.2,p75:0.4,p90:0.6} }, context:{uniqueVisitedPoints:{median:8,p75:10,p90:12}}, reasons:[] };
const assigned:any = { technicianId:'t1', standardCurrent:4, standardCarryover:0, smartcleanCurrent:1, smartcleanCarryover:0, equipmentKnownPointCount:5, equipmentUnknownPointCount:0, assignedCoolerCount:20, assignedTowerCount:8, assignedTapCount:6, assignedSmarttapCount:2, assignedLocatedPointCount:5, assignedUnlocatedPointCount:0, assignedFieldP90RadiusMeters:5000, assignedRouteEstimateMeters:12000, assignedRouteCoherenceRatio:1.2, assignedClusterCount:1, assignedIsolatedPointCount:0, assignedFragmentationRatio:0.2, workAreaCenterDistanceMeters:1000 };

test('equipment increase changes service pressure and risk without mutating source', () => {
  const result = service.simulate(assigned, baseline, maturity, { coolerDelta: 15 });
  assert.equal(result.before.workload.servicePressure.coolerCount, 'WITHIN_BASELINE');
  assert.equal(result.after.workload.servicePressure.coolerCount, 'ABOVE_P90');
  assert.equal(result.after.risk.severity, 'HIGH');
  assert.equal(assigned.assignedCoolerCount, 20);
});

test('route what-if can expose travel risk delta', () => {
  const result = service.simulate(assigned, baseline, maturity, { routeEstimateMeters: 25000 });
  assert.equal(result.after.workload.travelPressure.routeDistanceMeters, 'ABOVE_P90');
  assert.equal(result.after.risk.severity, 'HIGH');
  assert.ok(result.riskDelta > 0);
});

test('point removal style negative deltas are clamped safely at zero', () => {
  const result = service.simulate(assigned, baseline, maturity, { standardCurrentDelta: -99, coolerDelta: -99 });
  assert.equal(result.after.assigned.standardCurrent, 0);
  assert.equal(result.after.assigned.assignedCoolerCount, 0);
});

test('technician placement comparison prefers the lower post-change risk and never mutates assignments', () => {
  const targetBaseline:any = { ...baseline, technicianId:'t2', service:{ ...baseline.service, completedVisits:{median:16,p75:20,p90:24}, coolerCount:{median:30,p75:40,p90:50} } };
  const target:any = { ...assigned, technicianId:'t2', standardCurrent:2, smartcleanCurrent:0, assignedCoolerCount:8 };
  const result = service.comparePlacement(assigned, baseline, target, targetBaseline, maturity, { standardCurrentDelta:6, coolerDelta:20 });
  assert.equal(result.mode, 'TECHNICIAN_PLACEMENT_COMPARISON');
  assert.equal(result.preferredTechnicianId, 't2');
  assert.ok(result.constraints.includes('NO_AUTOMATIC_ASSIGNMENT_CHANGE'));
  assert.equal(assigned.standardCurrent, 4);
  assert.equal(target.standardCurrent, 2);
});

test('region placement applies the real region workload vector without changing assignment state', () => {
  const target:any = { ...assigned, technicianId:'t2', standardCurrent:1, smartcleanCurrent:0, assignedCoolerCount:5 };
  const targetBaseline:any = { ...baseline, technicianId:'t2' };
  const region:any = {
    regionId:'r1', standardCurrent:3, standardCarryover:1, smartcleanCurrent:2, smartcleanCarryover:0,
    equipmentKnownPointCount:5, equipmentUnknownPointCount:0, coolerCount:12, towerCount:4, tapCount:3, smarttapCount:1,
    locatedPointCount:5, unlocatedPointCount:0, p90RadiusMeters:6000, fragmentationRatio:0.2,
  };
  const result = service.simulateRegionPlacement(region, 't1', target, targetBaseline, maturity);
  assert.equal(result.mode, 'REGION_PLACEMENT_SIMULATION');
  assert.equal(result.scenario.after.assigned.standardCurrent, 4);
  assert.equal(result.scenario.after.assigned.assignedCoolerCount, 17);
  assert.equal(result.sourceTechnicianId, 't1');
  assert.ok(result.constraints.includes('NO_AUTOMATIC_REGION_ASSIGNMENT_CHANGE'));
  assert.equal(target.standardCurrent, 1);
});
