import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PointDifficultyService } from './point-difficulty.service';
import { EquipmentProfileService } from './equipment-profile.service';
import { FeatureSnapshot, FeatureValue } from './feature-store.types';
import { DifficultyCalibrationService } from './difficulty-calibration.service';

const service = new PointDifficultyService(new EquipmentProfileService(), new DifficultyCalibrationService());

function snap(week: number, features: Record<string, FeatureValue>): FeatureSnapshot {
  return {
    weekKey: `2026-W${week}`,
    isoYear: 2026,
    isoWeek: week,
    weekStart: `2026-01-${String(week).padStart(2, '0')}`,
    weekEnd: `2026-01-${String(week + 6).padStart(2, '0')}`,
    startInstant: new Date().toISOString(),
    endExclusiveInstant: new Date().toISOString(),
    sourceDataThrough: null,
    sourceHash: String(week),
    generatedAt: new Date().toISOString(),
    records: [{ entityType: 'POINT', entityId: 'p1', features }],
  };
}

test('does not invent a difficulty score when equipment is missing', () => {
  const p = service.assessPoint([snap(1, { visitCount: 5, attemptCount: 1 })], 'p1');
  assert.equal(p.score, null);
  assert.equal(p.state, 'WARMING_UP');
});

test('activates only with equipment and outcome depth', () => {
  const history = [1, 2, 3, 4].map((week) => snap(week, {
    coolerCount: 2,
    towerCount: 1,
    tapCount: 4,
    smarttapCount: 1,
    equipmentProfileComplete: true,
    equipmentVerificationAgeDays: 10,
    equipmentVerifiedAt: '2026-01-15T00:00:00Z',
    equipmentConfirmedVisitCount: 1,
    equipmentSnapshotCoolerCount: 2,
    equipmentSnapshotTowerCount: 1,
    equipmentSnapshotTapCount: 4,
    equipmentSnapshotSmarttapCount: 1,
    hasCanonicalLocation: true,
    visitCount: 1,
    attemptCount: week === 4 ? 1 : 0,
    completedObligationCount: 1,
    missedObligationCount: 0,
  }));
  const p = service.assessPoint(history, 'p1');
  assert.equal(p.state, 'ACTIVE');
  assert.ok(p.score !== null);
  assert.equal(p.serviceWorkload.index, null);
  assert.equal(p.serviceWorkload.state, 'WARMING_UP');
});

test('keeps geography as evidence without arbitrary distance weight', () => {
  const p = service.assessPoint([snap(1, {
    coolerCount: 1,
    towerCount: 1,
    tapCount: 1,
    smarttapCount: 1,
    equipmentProfileComplete: true,
    equipmentVerificationAgeDays: 10,
    equipmentVerifiedAt: '2026-01-15T00:00:00Z',
    equipmentConfirmedVisitCount: 1,
    equipmentSnapshotCoolerCount: 2,
    equipmentSnapshotTowerCount: 1,
    equipmentSnapshotTapCount: 4,
    equipmentSnapshotSmarttapCount: 1,
    hasCanonicalLocation: true,
    geographicIsolated: true,
    nearestNeighborMeters: 4200,
  })], 'p1');
  assert.equal(p.geography.isolated, true);
  assert.equal(p.geography.nearestNeighborMeters, 4200);
  assert.equal(p.score, null);
});


test('historical reconstruction keeps visit-level equipment snapshots separated by week', () => {
  const base = { equipmentProfileComplete: true, equipmentVerificationAgeDays: 10, equipmentConfirmedVisitCount: 1, hasCanonicalLocation: true, visitCount: 1, completedObligationCount: 1, missedObligationCount: 0 };
  const history = [
    snap(1, { ...base, coolerCount: 1, towerCount: 1, tapCount: 2, smarttapCount: 0, equipmentSnapshotCoolerCount: 1, equipmentSnapshotTowerCount: 1, equipmentSnapshotTapCount: 2, equipmentSnapshotSmarttapCount: 0 }),
    snap(2, { ...base, coolerCount: 3, towerCount: 1, tapCount: 4, smarttapCount: 0, equipmentSnapshotCoolerCount: 3, equipmentSnapshotTowerCount: 1, equipmentSnapshotTapCount: 4, equipmentSnapshotSmarttapCount: 0 }),
  ];
  const trend = service.reconstructPoint(history, 'p1');
  assert.equal(trend[0].profile.equipment.coolerCount, 1);
  assert.equal(trend[1].profile.equipment.coolerCount, 3);
});
