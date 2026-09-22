import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { GeographyService } from './geography.service';
import { IdentityConfidenceService } from './identity-confidence.service';
import { FeatureSnapshot } from './feature-store.types';

const service = new IdentityConfidenceService(new GeographyService({} as any));
const snapshot = (left: Record<string, any>, right: Record<string, any>): FeatureSnapshot => ({
  weekKey: '2026-W37', isoYear: 2026, isoWeek: 37, weekStart: '2026-09-07', weekEnd: '2026-09-13',
  startInstant: '2026-09-07T00:00:00Z', endExclusiveInstant: '2026-09-14T00:00:00Z', sourceDataThrough: null,
  sourceHash: 'x', generatedAt: '2026-09-14T00:00:00Z', records: [
    { entityType: 'POINT', entityId: 'p1', features: left },
    { entityType: 'POINT', entityId: 'p2', features: right },
  ],
});
test('same Google place id yields a high identity candidate', () => {
  const [candidate] = service.assess([snapshot(
    { pointName: 'Barfix Mia', googlePlaceId: 'g1', canonicalLatitude: 38.4, canonicalLongitude: 27.1, locationEvidenceVisitCount: 2 },
    { pointName: 'Barfix', googlePlaceId: 'g1', canonicalLatitude: 38.4001, canonicalLongitude: 27.1001, locationEvidenceVisitCount: 2 },
  )]);
  assert.ok(candidate.confidence >= 0.9);
  assert.equal(candidate.sameGooglePlace, true);
  assert.equal(candidate.historySupported, true);
});

test('distant unrelated names are not promoted as duplicate candidates', () => {
  const result = service.assess([snapshot(
    { pointName: 'Alpha Cafe', canonicalLatitude: 38.4, canonicalLongitude: 27.1 },
    { pointName: 'Omega Hotel', canonicalLatitude: 38.6, canonicalLongitude: 27.4 },
  )]);
  assert.equal(result.length, 0);
});
