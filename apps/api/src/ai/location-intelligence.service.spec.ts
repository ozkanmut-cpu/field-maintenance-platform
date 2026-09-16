import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { GeographyService } from './geography.service';
import { LocationIntelligenceService } from './location-intelligence.service';
import { FeatureSnapshot } from './feature-store.types';

const service = new LocationIntelligenceService(new GeographyService({} as any));
const snap = (week: number, features: Record<string, any>): FeatureSnapshot => ({
  weekKey: `2026-W${String(week).padStart(2, '0')}`, isoYear: 2026, isoWeek: week,
  weekStart: '2026-01-01', weekEnd: '2026-01-07', startInstant: '2026-01-01T00:00:00Z', endExclusiveInstant: '2026-01-08T00:00:00Z',
  sourceDataThrough: null, sourceHash: String(week), generatedAt: '2026-01-08T00:00:00Z', records: [{ entityType: 'POINT', entityId: 'p1', features }],
});

test('strong stable location requires both stored confidence and repeated evidence', () => {
  const result = service.assessPoint([1,2,3].map((w) => snap(w, { hasCanonicalLocation: true, canonicalLatitude: 38.4, canonicalLongitude: 27.1, locationConfidence: 95, locationEvidenceVisitCount: 1, locationVisitToCanonicalMeters: 20 })), 'p1');
  assert.equal(result.state, 'STRONG');
  assert.equal(result.contradictionCount, 0);
});

test('large location movement becomes an explicit contradiction instead of false confidence', () => {
  const result = service.assessPoint([
    snap(1, { hasCanonicalLocation: true, canonicalLatitude: 38.4, canonicalLongitude: 27.1, locationConfidence: 90, locationEvidenceVisitCount: 1 }),
    snap(2, { hasCanonicalLocation: true, canonicalLatitude: 38.42, canonicalLongitude: 27.12, locationConfidence: 90, locationEvidenceVisitCount: 1 }),
  ], 'p1');
  assert.equal(result.state, 'CONTRADICTORY');
  assert.ok(result.reasonCodes.includes('LOCATION_CONTRADICTION'));
});
