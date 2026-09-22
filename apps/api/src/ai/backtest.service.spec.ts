import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BacktestService } from './backtest.service';
import { DataMaturityService } from './data-maturity.service';
import { PointDifficultyService } from './point-difficulty.service';
import { RiskEngineService } from './risk-engine.service';
import { EquipmentProfileService } from './equipment-profile.service';
import { DifficultyCalibrationService } from './difficulty-calibration.service';
import { FeatureSnapshot } from './feature-store.types';

const service = new BacktestService(new DataMaturityService(), new PointDifficultyService(new EquipmentProfileService(), new DifficultyCalibrationService()), new RiskEngineService());
function snap(week: number, attempt: number, missed: number): FeatureSnapshot {
  const point = { hasRegion: true, hasCanonicalLocation: true, canonicalLatitude: 38.4, canonicalLongitude: 27.1, locationConfidence: 95, maintenanceType: 'STANDARD', maintenanceWeek: 1, coolerCount: 2, towerCount: 1, tapCount: 2, smarttapCount: 0, equipmentProfileComplete: true, equipmentVerifiedAt: '2026-01-01T00:00:00Z', equipmentVerificationAgeDays: 1, equipmentConfirmedVisitCount: 1, equipmentSnapshotCoolerCount: 2, equipmentSnapshotTowerCount: 1, equipmentSnapshotTapCount: 2, equipmentSnapshotSmarttapCount: 0, visitCount: 1, attemptCount: attempt, completedObligationCount: 1, missedObligationCount: missed };
  return { weekKey: `2026-W${String(week).padStart(2,'0')}`, isoYear: 2026, isoWeek: week, weekStart: '2026-01-01', weekEnd: '2026-01-07', startInstant: '2026-01-01T00:00:00Z', endExclusiveInstant: '2026-01-08T00:00:00Z', sourceDataThrough: null, sourceHash: String(week), generatedAt: '2026-01-08T00:00:00Z', records: [
    { entityType: 'SYSTEM', entityId: 'SYSTEM', features: { activePointCount: 1, locatedPointCount: 1, activeTechnicianCount: 2, regionCount: 1, visitCount: 150, attemptCount: 10, equipmentProfileCoverage: 1 } },
    { entityType: 'POINT', entityId: 'p1', features: point },
  ] };
}

test('backtest evaluates historical risk against next-week observed adverse outcomes', () => {
  const history = [snap(1,0,0), snap(2,0,0), snap(3,1,0), snap(4,1,0), snap(5,1,0), snap(6,1,0), snap(7,1,0), snap(8,1,0), snap(9,1,0), snap(10,1,0), snap(11,1,0), snap(12,1,0)];
  const result = service.evaluate(history);
  assert.equal(result.state, 'READY');
  assert.ok(result.evaluatedPredictions > 0);
  assert.ok(result.truePositive > 0);
});

test('short history is not presented as validated performance', () => {
  const result = service.evaluate([snap(1,0,0), snap(2,0,0), snap(3,0,0), snap(4,0,0)]);
  assert.equal(result.state, 'INSUFFICIENT_DATA');
  assert.ok(result.reasonCodes.includes('BACKTEST_HISTORY_TOO_SHORT'));
});
