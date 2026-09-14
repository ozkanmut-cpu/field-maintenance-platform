import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DataQualityEngineService } from './data-quality-engine.service';
import { EquipmentProfileService } from './equipment-profile.service';
import { GeographyService } from './geography.service';
import { LocationIntelligenceService } from './location-intelligence.service';
import { FeatureSnapshot } from './feature-store.types';

const service = new DataQualityEngineService(new EquipmentProfileService(), new LocationIntelligenceService(new GeographyService({} as any)));
const snap = (week: number, features: Record<string, any>): FeatureSnapshot => ({
  weekKey: `2026-W${String(week).padStart(2, '0')}`, isoYear: 2026, isoWeek: week, weekStart: '2026-01-01', weekEnd: '2026-01-07',
  startInstant: '2026-01-01T00:00:00Z', endExclusiveInstant: '2026-01-08T00:00:00Z', sourceDataThrough: null, sourceHash: String(week), generatedAt: '2026-01-08T00:00:00Z',
  records: [{ entityType: 'POINT', entityId: 'p1', features }],
});

test('prioritizes missing and contradictory metadata instead of silently scoring it', () => {
  const result = service.assess([snap(1, { hasRegion: false, hasCanonicalLocation: false, maintenanceType: 'SMARTCLEAN', maintenanceWeek: 0, equipmentProfileComplete: false })]);
  assert.ok(result.issues.some((x) => x.code === 'SMARTCLEAN_RUT_WEEK_INVALID' && x.severity === 'CRITICAL'));
  assert.ok(result.issues.some((x) => x.code === 'LOCATION_MISSING'));
  assert.ok(result.score < 100);
});

test('stable complete verified point can remain issue free', () => {
  const history = [1,2,3,4].map((w) => snap(w, { hasRegion: true, hasCanonicalLocation: true, canonicalLatitude: 38.4, canonicalLongitude: 27.1, locationConfidence: 95, locationEvidenceVisitCount: 1, locationVisitToCanonicalMeters: 10, maintenanceType: 'SMARTCLEAN', maintenanceWeek: 1, coolerCount: 1, towerCount: 1, tapCount: 2, smarttapCount: 0, equipmentProfileComplete: true, equipmentVerifiedAt: '2026-01-07T00:00:00Z', equipmentVerificationAgeDays: 1, equipmentConfirmedVisitCount: 1, equipmentSnapshotCoolerCount: 1, equipmentSnapshotTowerCount: 1, equipmentSnapshotTapCount: 2, equipmentSnapshotSmarttapCount: 0 }));
  const result = service.assess(history);
  assert.equal(result.issues.length, 0);
  assert.equal(result.score, 100);
});

test('stale equipment and location contradiction are raised explicitly', () => {
  const result = service.assess([
    snap(1, { hasRegion: true, hasCanonicalLocation: true, canonicalLatitude: 38.4, canonicalLongitude: 27.1, locationConfidence: 90, locationEvidenceVisitCount: 1, maintenanceType: 'STANDARD', maintenanceWeek: 1, coolerCount: 1, towerCount: 1, tapCount: 1, smarttapCount: 0, equipmentProfileComplete: true, equipmentVerifiedAt: '2025-01-01T00:00:00Z', equipmentVerificationAgeDays: 150, equipmentConfirmedVisitCount: 1, equipmentSnapshotCoolerCount: 1, equipmentSnapshotTowerCount: 1, equipmentSnapshotTapCount: 1, equipmentSnapshotSmarttapCount: 0 }),
    snap(2, { hasRegion: true, hasCanonicalLocation: true, canonicalLatitude: 38.42, canonicalLongitude: 27.12, locationConfidence: 90, locationEvidenceVisitCount: 1, maintenanceType: 'STANDARD', maintenanceWeek: 1, coolerCount: 1, towerCount: 1, tapCount: 1, smarttapCount: 0, equipmentProfileComplete: true, equipmentVerifiedAt: '2025-01-01T00:00:00Z', equipmentVerificationAgeDays: 160, equipmentConfirmedVisitCount: 1, equipmentSnapshotCoolerCount: 1, equipmentSnapshotTowerCount: 1, equipmentSnapshotTapCount: 1, equipmentSnapshotSmarttapCount: 0 }),
  ]);
  assert.ok(result.issues.some((x) => x.code === 'EQUIPMENT_PROFILE_STALE'));
  assert.ok(result.issues.some((x) => x.code === 'LOCATION_CONTRADICTION'));
});
