import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DifficultyCalibrationService } from './difficulty-calibration.service';
import { FeatureSnapshot } from './feature-store.types';

const service = new DifficultyCalibrationService();

function snapshot(week: number, rows: Array<{ id: string; high: boolean; adverse: boolean }>): FeatureSnapshot {
  return {
    weekKey: `2026-W${week}`,
    isoYear: 2026, isoWeek: week,
    weekStart: `2026-02-${String(week).padStart(2, '0')}`,
    weekEnd: `2026-02-${String(week + 1).padStart(2, '0')}`,
    startInstant: '2026-02-01T00:00:00Z', endExclusiveInstant: '2026-02-08T00:00:00Z',
    sourceDataThrough: null, sourceHash: String(week), generatedAt: '2026-02-08T00:00:00Z',
    records: rows.map((row) => ({ entityType: 'POINT' as const, entityId: row.id, features: {
      coolerCount: row.high ? 8 : 1, towerCount: row.high ? 4 : 1,
      tapCount: row.high ? 10 : 2, smarttapCount: row.high ? 3 : 0,
      nearestNeighborMeters: row.high ? 5000 : 300, geographicIsolated: row.high,
      visitCount: row.adverse ? 0 : 1, attemptCount: row.adverse ? 1 : 0,
      completedObligationCount: row.adverse ? 0 : 1, missedObligationCount: row.adverse ? 1 : 0,
    }})),
  };
}
test('learns higher empirical difficulty for equipment-heavy isolated cohorts', () => {
  const history = [1, 2, 3, 4].map((week) => snapshot(week, [
    { id: 'low-a', high: false, adverse: false },
    { id: 'low-b', high: false, adverse: false },
    { id: 'high-a', high: true, adverse: true },
    { id: 'high-b', high: true, adverse: true },
  ]));
  const high = service.estimate(history, 'high-a');
  const low = service.estimate(history, 'low-a');
  assert.ok(high.estimatedRate !== null && low.estimatedRate !== null);
  assert.ok(high.estimatedRate! > low.estimatedRate!);
  assert.ok(high.reasonCodes.some((code) => code.includes('COOLER_LOAD_HIGH')));
  assert.ok(high.reasonCodes.some((code) => code.includes('GEOGRAPHIC_ISOLATION_TRUE')));
});

test('does not invent calibration when outcome evidence is too shallow', () => {
  const result = service.estimate([snapshot(1, [{ id: 'p1', high: true, adverse: true }])], 'p1');
  assert.equal(result.estimatedRate, null);
  assert.ok(result.reasonCodes.includes('DIFFICULTY_CALIBRATION_EVIDENCE_LOW'));
});
