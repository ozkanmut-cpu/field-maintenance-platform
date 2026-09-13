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

test('operational area rejects distant Hatay province and HATAY searches İzmir local aliases', () => {
  const doryol = candidate('Portofino', 'Yeniyurt, 31620 Dörtyol/Hatay', 36.8596076, 36.1427114);
  const guzelyali = candidate('Portofino Lounge', 'Güzelyalı, Mithatpaşa Cd. No:1126/A, Konak/İzmir', 38.3981559, 27.0848575);
  assert.equal(service.isWithinOperationalArea(doryol), false);
  assert.equal(service.isWithinOperationalArea(guzelyali), true);
  const queries = service.buildQueries('PORTOFİNO', 'HATAY');
  assert.ok(queries.some((q: string) => q.includes('Güzelyalı')));
  assert.ok(queries.some((q: string) => q.includes('Konak')));
  assert.ok(queries.some((q: string) => q.includes('Karabağlar')));
});

test('generic type or numeric overlap cannot substitute for venue identity', () => {
  const arena = candidate('ARENA NIGHT CLUB', 'Gökkaya, Ahmetli/Manisa', 38.52, 27.94);
  const noter = candidate('Tire 1. Noter', 'Yeni, Tire/İzmir', 38.09, 27.73);
  const varan = candidate('VARAN TURİZM URLA', 'Yaka, Urla/İzmir', 38.32, 26.76);
  assert.equal(service.nameScore(service.normalize('NEFESİM NIGHT CLUB'), service.normalize('ARENA NIGHT CLUB')), 0);
  assert.equal(service.nameScore(service.normalize('CARTA 1'), service.normalize('Tire 1. Noter')), 0);
  assert.equal(service.nameScore(service.normalize('KEYFİ KAHYA TURİZM'), service.normalize('VARAN TURİZM URLA')), 0);
  assert.equal(service.identityStrength('NEFESİM NIGHT CLUB', 'NEFESİM NIGHT CLUB', 'MANİSA', arena), 0);
  assert.equal(service.identityStrength('CARTA 1', 'CARTA 1', 'TİRE', noter), 0);
  assert.equal(service.identityStrength('KEYFİ KAHYA TURİZM', null, 'URLA', varan), 0);
});

test('duplicated SAP name does not double-count a partial brand match', () => {
  const wrongBranch = candidate('Sir Winston Pub', 'İnönü, Karşıyaka/İzmir', 38.47, 27.11);
  assert.equal(service.identityStrength('SİR WİNSTON GÖZTEPE', 'SIR WINSTON GÖZTEPE', 'HATAY', wrongBranch), 1);
});

test('missing branch qualifier caps a same-brand candidate below auto acceptance', () => {
  const wrongWinston = candidate('Sir Winston Pub', 'İnönü, Karşıyaka/İzmir', 38.47, 27.11);
  const wrongMaze = candidate('Maze İzmir', 'Umurbey, Konak/İzmir', 38.44, 27.15);
  const anchors = [{ latitude: 38.40, longitude: 27.10 }, { latitude: 38.41, longitude: 27.11 }, { latitude: 38.42, longitude: 27.12 }];
  assert.ok(service.score('SİR WİNSTON GÖZTEPE', 'HATAY', wrongWinston, anchors) < 70);
  assert.ok(service.score('MAZE BALÇOVA', 'BALÇOVA', wrongMaze, anchors) < 70);
});

test('narrow İzmir operational regions reject cross-city-side candidates', () => {
  const karsiyakaWinston = candidate('Sir Winston Pub', 'İnönü, 6718. Sk. No:68/C, Karşıyaka/İzmir', 38.47, 27.11);
  const konakFourPoints = candidate('Four Points by Sheraton Izmir', 'Çınarlı, Ankara Asfaltı Cd. No:17-A, Konak/İzmir', 38.45, 27.16);
  const hatayAnchors = [
    { latitude: 38.399, longitude: 27.086 }, { latitude: 38.402, longitude: 27.095 }, { latitude: 38.405, longitude: 27.10 },
  ];
  const bayrakliAnchors = [
    { latitude: 38.46, longitude: 27.16 }, { latitude: 38.465, longitude: 27.17 }, { latitude: 38.47, longitude: 27.18 },
  ];
  assert.equal(service.isPlausibleRegionCandidate('HATAY', karsiyakaWinston, hatayAnchors), false);
  assert.equal(service.isPlausibleRegionCandidate('BAYRAKLI', konakFourPoints, bayrakliAnchors), true);
});
