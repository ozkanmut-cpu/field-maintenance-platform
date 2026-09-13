import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PointAddressDiscoveryService } from './point-address-discovery.service';

const service = new PointAddressDiscoveryService({} as never, {} as never) as any;
const candidate = (name: string, address: string, lat: number, lng: number) => ({
  displayName: { text: name }, formattedAddress: address, location: { latitude: lat, longitude: lng },
});

test('old/new venue names at same physical place form a definitive SAP transition', () => {
  const studio = candidate('Studio House Atakent', 'Atakent, 2035. Sk. No. 4, Karşıyaka/İzmir', 38.4676729, 27.0861237);
  const kantin = candidate('Kantin Atakent', 'Atakent, 2035. Sk. No. 4, Karşıyaka/İzmir', 38.4676765, 27.0861215);
  assert.equal(service.isSapTransitionCandidate('STÜDYO HOUSE ATAKENT(KAFE KANTİN)', 'KANTİN', 'BOSTANLI', kantin, studio), true);

  const scotch = candidate('The Scotch Pub', 'Atakent, Şht. Cengiz Topel Cd., Karşıyaka/İzmir', 38.4588325, 27.0932051);
  const mahalleli = candidate('The Mahalleli', 'Atakent, Şht. Cengiz Topel Cd., Karşıyaka/İzmir', 38.4588325, 27.0932051);
  assert.equal(service.isSapTransitionCandidate('SCOTCH BOSTANLI (MAHALLELİ)', 'MAHALLELİ', 'BOSTANLI', mahalleli, scotch), true);
});

test('concept suffix changes keep a distinctive venue identity', () => {
  const kordelya = candidate('Kordelya Bar rock&jazz', 'Bostanlı, Cemal Gürsel Cd. 476/7, Karşıyaka/İzmir', 38.46, 27.09);
  assert.ok(service.identityStrength('KORDELYA CAFE', 'KORDELYA CAFE', 'BOSTANLI', kordelya) >= 2);

  const fourPoints = candidate('Four Points by Sheraton Izmir', 'Çınarlı, Ankara Asfaltı Caddesi No:17-A, Konak/İzmir', 38.45, 27.16);
  assert.ok(service.identityStrength('FOUR POİNTS BY SHERATON', 'FOUR POİNTS BY SHERATON', 'BAYRAKLI', fourPoints) >= 2);
});

test('branch qualifier in the point name breaks same-brand ties', () => {
  const social = candidate('Rasa.Social İzmir', 'Atakent, 2035. Sk. No:6, Karşıyaka/İzmir', 38.467, 27.086);
  const community = candidate('Rasa.Community', 'Bostanlı, Şht. Cengiz Topel Cd. No:9, Karşıyaka/İzmir', 38.46, 27.09);
  assert.equal(service.hasAddressQualifierMatch('RASA ATAKENT', social), true);
  assert.equal(service.hasAddressQualifierMatch('RASA ATAKENT', community), false);
});

test('generic numeric token must not turn 1912 Highball into 1912 KSK', () => {
  const highball = candidate('1912 Highball', 'Bostanlı, 1807/2. Sk. No:28/B, Karşıyaka/İzmir', 38.45, 27.10);
  assert.ok(service.identityStrength('1912 KSK LOKASYON', '1912 KSK', 'BOSTANLI', highball) < 2);
});

test('regional proximity may cross nearby district boundaries when identity is strong', () => {
  const near = { candidate: candidate('Same Venue', 'Nearby district', 38.0, 27.0), score: 90, query: '', regionDistance: 28_000 };
  const far = { candidate: candidate('Same Venue', 'Far district', 39.0, 28.0), score: 90, query: '', regionDistance: 65_000 };
  assert.equal(service.hasDecisiveGeography('AKHİSAR', near, far, 2), true);

  const tooFar = { ...near, regionDistance: 55_000 };
  assert.equal(service.hasDecisiveGeography('URLA', tooFar, far, 2), false);
});
