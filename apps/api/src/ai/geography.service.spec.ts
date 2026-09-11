import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { GeographyService } from './geography.service';

const service = new GeographyService({} as any);

test('distance is symmetric and zero for same coordinate', () => {
  const a = { latitude: 38.4192, longitude: 27.1287 };
  const b = { latitude: 38.4237, longitude: 27.1428 };
  assert.equal(service.distanceMeters(a, a), 0);
  const ab = service.distanceMeters(a, b);
  const ba = service.distanceMeters(b, a);
  assert.ok(ab > 1000 && ab < 2000);
  assert.ok(Math.abs(ab - ba) < 0.000001);
});

test('summary exposes center and dispersion without arbitrary classification', () => {
  const summary = service.summarize([
    { latitude: 38.40, longitude: 27.10 },
    { latitude: 38.41, longitude: 27.11 },
    { latitude: 38.42, longitude: 27.12 },
  ]);
  assert.equal(summary.sampleCount, 3);
  assert.ok(summary.centerLatitude! > 38.409 && summary.centerLatitude! < 38.411);
  assert.ok(summary.p90RadiusMeters! > 1000);
  assert.ok(summary.maxRadiusMeters! >= summary.p90RadiusMeters!);
});

test('adjacency requires caller-supplied threshold', () => {
  const a = { latitude: 38.40, longitude: 27.10 };
  const b = { latitude: 38.401, longitude: 27.101 };
  assert.equal(service.areAdjacent(a, b, 500), true);
  assert.equal(service.areAdjacent(a, b, 50), false);
});
