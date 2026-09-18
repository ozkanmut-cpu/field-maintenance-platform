import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { evaluateMaintenanceLocation } from './maintenance-location-policy';

const base = {
  enteredLate: false,
  suspiciousBatch: false,
  locationPresenceConfirmed: true,
  accuracyMeters: 30,
  visitLatitude: 38.4192,
  visitLongitude: 27.1287,
  canonicalLatitude: 38.4192,
  canonicalLongitude: 27.1287,
};

test('near, accurate, confirmed maintenance is eligible without location review', () => {
  const result = evaluateMaintenanceLocation(base);
  assert.equal(result.locationLearningEligible, true);
  assert.equal(result.locationReviewRequired, false);
});

test('distant confirmed maintenance remains valid evidence but requires review and is not learnable', () => {
  const result = evaluateMaintenanceLocation({ ...base, visitLongitude: 27.1387 });
  assert.equal(result.locationLearningEligible, false);
  assert.equal(result.locationReviewRequired, true);
  assert.match(result.reviewReason ?? '', /KONUM UYUŞMAZLIĞI/);
});

test('poor GPS accuracy requires review and is not learnable', () => {
  const result = evaluateMaintenanceLocation({ ...base, accuracyMeters: 81 });
  assert.equal(result.locationLearningEligible, false);
  assert.equal(result.locationReviewRequired, true);
  assert.match(result.reviewReason ?? '', /GPS HASSASİYETİ/);
});

test('technician can complete maintenance without confirming presence, but the location is never learnable', () => {
  const result = evaluateMaintenanceLocation({ ...base, locationPresenceConfirmed: false });
  assert.equal(result.locationLearningEligible, false);
  assert.equal(result.locationReviewRequired, false);
});

test('protected Google location is never automatically replaced by a distant technician visit', () => {
  const result = evaluateMaintenanceLocation({ ...base, visitLongitude: 27.1387 });
  assert.equal(result.locationLearningEligible, false);
  assert.equal(result.locationReviewRequired, true);
});
