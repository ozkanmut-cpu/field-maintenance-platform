import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FeatureSnapshot } from './feature-store.types';
import { WorkloadCalibrationService } from './workload-calibration.service';

const service = new WorkloadCalibrationService();
function snapshot(week: number, rows: Array<Record<string, number | boolean>>) : FeatureSnapshot {
  return {
    engineVersion: 'test', featureSchemaVersion: 'test', weekKey: `2026-W${week}`, isoYear: 2026, isoWeek: week,
    weekStart: `2026-01-${String(week).padStart(2,'0')}`, weekEnd: `2026-01-${String(week+6).padStart(2,'0')}`,
    startInstant: new Date().toISOString(), endExclusiveInstant: new Date().toISOString(), sourceDataThrough: null,
    sourceHash: String(week), generatedAt: new Date().toISOString(),
    records: rows.map((features, index) => ({ entityType:'POINT' as const, entityId:`p${index}`, features })),
  };
}
test('learns relative equipment and travel impact from observed outcomes', () => {
  const history = [1,2,3,4].map((week) => snapshot(week, [
    { coolerCount:1, towerCount:1, tapCount:1, smarttapCount:0, nearestNeighborMeters:100, geographicIsolated:false, visitCount:4, attemptCount:0, missedObligationCount:0, completedObligationCount:4 },
    { coolerCount:8, towerCount:4, tapCount:6, smarttapCount:2, nearestNeighborMeters:5000, geographicIsolated:true, visitCount:1, attemptCount:3, missedObligationCount:1, completedObligationCount:1 },
    { coolerCount:2, towerCount:1, tapCount:2, smarttapCount:0, nearestNeighborMeters:200, geographicIsolated:false, visitCount:4, attemptCount:0, missedObligationCount:0, completedObligationCount:4 },
    { coolerCount:9, towerCount:5, tapCount:7, smarttapCount:3, nearestNeighborMeters:6000, geographicIsolated:true, visitCount:1, attemptCount:3, missedObligationCount:1, completedObligationCount:1 },
  ]));
  const result = service.assess(history);
  const cooler = result.equipment.find((x) => x.code === 'COOLER_RELATIVE_WORKLOAD')!;
  const travel = result.travel.find((x) => x.code === 'GEOGRAPHIC_SEPARATION_BURDEN')!;
  assert.ok((cooler.relativeImpact ?? 0) > 0);
  assert.ok((travel.relativeImpact ?? 0) > 0);
  assert.equal(result.confidence, 'MEDIUM');
});
test('flags calibration drift when recent impact moves materially', () => {
  const quiet = [1,2,3,4].map((week) => snapshot(week, [
    { coolerCount:1, towerCount:1, tapCount:1, smarttapCount:0, nearestNeighborMeters:100, geographicIsolated:false, visitCount:4, attemptCount:0, missedObligationCount:0, completedObligationCount:4 },
    { coolerCount:8, towerCount:4, tapCount:6, smarttapCount:2, nearestNeighborMeters:5000, geographicIsolated:true, visitCount:4, attemptCount:0, missedObligationCount:0, completedObligationCount:4 },
  ]));
  const changed = [5,6,7,8].map((week) => snapshot(week, [
    { coolerCount:1, towerCount:1, tapCount:1, smarttapCount:0, nearestNeighborMeters:100, geographicIsolated:false, visitCount:4, attemptCount:0, missedObligationCount:0, completedObligationCount:4 },
    { coolerCount:8, towerCount:4, tapCount:6, smarttapCount:2, nearestNeighborMeters:5000, geographicIsolated:true, visitCount:0, attemptCount:4, missedObligationCount:2, completedObligationCount:0 },
  ]));
  const result = service.assess([...quiet, ...changed]);
  assert.ok(result.drift.some((item) => item.state === 'DRIFT'));
  assert.ok(result.reasonCodes.includes('CALIBRATION_DRIFT_DETECTED'));
});
