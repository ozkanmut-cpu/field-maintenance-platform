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

test('nearby locality rules prefer trusted adjacent districts without leaking to unrelated regions', () => {
  const karacasu = candidate('Elmas Restaurant Hotel', 'Dandalas Mevkii, Yaylalı, 09370 Karacasu/Aydın', 37.73465, 28.63559);
  const bergama = candidate('Dostlar Birahanesi', 'Ertuğrul, Cumhuriyet Cd. No:17, 35700 Bergama/İzmir', 39.12, 27.18);
  const seferihisar = candidate('Neptün Hotels', 'Sığacık, Akkum Cd. No:175, 35460 Seferihisar/İzmir', 38.19, 26.78);
  assert.equal(service.isCompatibleNearbyLocality('NAZİLLİ', karacasu), true);
  assert.equal(service.isCompatibleNearbyLocality('AKHİSAR', bergama), false);
  assert.equal(service.isCompatibleNearbyLocality('URLA', seferihisar), false);
});
