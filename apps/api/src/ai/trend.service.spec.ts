import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TrendService } from './trend.service';
import { DataMaturityService } from './data-maturity.service';
import { DataQualityEngineService } from './data-quality-engine.service';
import { EquipmentProfileService } from './equipment-profile.service';
import { GeographyService } from './geography.service';
import { LocationIntelligenceService } from './location-intelligence.service';
import { PointDifficultyService } from './point-difficulty.service';
import { RegionHealthService } from './region-health.service';
import { TechnicianBaselineService } from './technician-baseline.service';
import { FeatureSnapshot } from './feature-store.types';

const equipment = new EquipmentProfileService();
const location = new LocationIntelligenceService(new GeographyService({} as any));
const service = new TrendService(new DataMaturityService(), new DataQualityEngineService(equipment, location), new RegionHealthService(), new TechnicianBaselineService(), new PointDifficultyService(equipment));
const snap = (week: number, completed: number, difficultyAttempt: number): FeatureSnapshot => ({
  weekKey: `2026-W${String(week).padStart(2,'0')}`,
  isoYear: 2026,
  isoWeek: week,
  weekStart: '2026-01-01',
  weekEnd: '2026-01-07',
  startInstant: '2026-01-01T00:00:00Z',
  endExclusiveInstant: '2026-01-08T00:00:00Z',
  sourceDataThrough: null,
  sourceHash: String(week),
  generatedAt: '2026-01-08T00:00:00Z',
  records: [
    { entityType: 'SYSTEM', entityId: 'SYSTEM', features: { activePointCount: 1, locatedPointCount: 1, activeTechnicianCount: 2, regionCount: 1, visitCount: 80, attemptCount: 5, equipmentProfileCoverage: 1 } },
    { entityType: 'TECHNICIAN', entityId: 't1', features: { completedVisitCount: completed, equipmentSnapshotCoverage: 1, servicedCoolerCount: 2, servicedTowerCount: 1, servicedTapCount: 2, servicedSmarttapCount: 0, fieldP90RadiusMeters: 1000, fieldRouteDistanceMeters: 2000, uniqueVisitedPointCount: completed } },
    { entityType: 'REGION', entityId: 'r1', features: { pointCount: 10, locationCoverage: .9, visitCount: 10, attemptCount: 1, smartcleanCarryoverWorkloadCount: 0, geographicFragmentationRatio: .1 } },
    { entityType: 'POINT', entityId: 'p1', features: { hasRegion: true, hasCanonicalLocation: true, canonicalLatitude: 38.4, canonicalLongitude: 27.1, locationConfidence: 95, locationEvidenceVisitCount: 1, locationVisitToCanonicalMeters: 10, maintenanceType: 'STANDARD', maintenanceWeek: 1, coolerCount: 2, towerCount: 1, tapCount: 2, smarttapCount: 0, equipmentProfileComplete: true, equipmentVerifiedAt: '2026-01-01T00:00:00Z', equipmentVerificationAgeDays: 1, equipmentConfirmedVisitCount: 1, equipmentSnapshotCoolerCount: 2, equipmentSnapshotTowerCount: 1, equipmentSnapshotTapCount: 2, equipmentSnapshotSmarttapCount: 0, visitCount: 1, attemptCount: difficultyAttempt, completedObligationCount: 1, missedObligationCount: 0 } },
  ],
});

test('trend service compares weekly system quality and rolling capacity/difficulty', () => {
  const history = [snap(1, 4, 0), snap(2, 5, 0), snap(3, 6, 1), snap(4, 8, 1), snap(5, 9, 1)];
  const result = service.assess(history);
  assert.equal(result.weekly.length, 5);
  assert.equal(result.regions[0].regionId, 'r1');
  assert.equal(result.technicians[0].technicianId, 't1');
  assert.ok(result.technicians[0].currentCapacityP75 !== null);
  assert.equal(result.points[0].pointId, 'p1');
});
