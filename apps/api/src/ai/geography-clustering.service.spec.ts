import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { GeographyClusteringService } from './geography-clustering.service';
import { GeographyService } from './geography.service';

const sut = new GeographyClusteringService(new GeographyService({} as any));

test('fixed-radius clustering is deterministic and isolates distant points', () => {
  const points = [
    { id: 'a', latitude: 38.40, longitude: 27.10 },
    { id: 'b', latitude: 38.401, longitude: 27.101 },
    { id: 'c', latitude: 38.402, longitude: 27.102 },
    { id: 'z', latitude: 38.60, longitude: 27.40 },
  ];
  const result = sut.clusterWithRadius(points, 500);
  assert.equal(result.clusterCount, 1);
  assert.equal(result.clusteredPointCount, 3);
  assert.deepEqual(result.clusters[0].pointIds, ['a', 'b', 'c']);
  assert.deepEqual(result.isolatedPointIds, ['z']);
});

test('adaptive clustering derives its link distance from observed nearest-neighbor distances', () => {
  const result = sut.clusterAdaptive([
    { id: 'a', latitude: 38.40, longitude: 27.10 },
    { id: 'b', latitude: 38.401, longitude: 27.101 },
    { id: 'c', latitude: 38.402, longitude: 27.102 },
    { id: 'd', latitude: 38.403, longitude: 27.103 },
  ]);
  assert.ok(result.adaptiveLinkMeters! > 0);
  assert.equal(result.adaptiveLinkMeters, result.nearestNeighborP75Meters);
  assert.ok(result.clusteredPointCount >= 3);
  assert.ok(result.clusterCount >= 1);
  assert.ok(result.fragmentationRatio > 0 && result.fragmentationRatio <= 1);
});

test('single point remains isolated and does not invent a clustering radius', () => {
  const result = sut.clusterAdaptive([{ id: 'only', latitude: 38.4, longitude: 27.1 }]);
  assert.equal(result.adaptiveLinkMeters, null);
  assert.equal(result.isolatedPointCount, 1);
  assert.deepEqual(result.isolatedPointIds, ['only']);
});
