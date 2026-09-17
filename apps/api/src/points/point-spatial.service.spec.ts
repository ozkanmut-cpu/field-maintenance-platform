import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PointSpatialService } from './point-spatial.service';

type Candidate = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  regionId: string | null;
  regionName: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
};

function candidate(id: string, distanceMeters: number): Candidate {
  return {
    id,
    code: `C-${id}`,
    name: `Point ${id}`,
    address: 'İzmir',
    regionId: 'region-1',
    regionName: 'ALSANCAK',
    latitude: 38.42,
    longitude: 27.13,
    distanceMeters,
  };
}

function harness(
  candidates: Candidate[],
  owners: Record<string, { technicianId: string | null; source: string }>,
) {
  const rawCalls: unknown[][] = [];
  const prisma = {
    $queryRaw: async (...args: unknown[]) => {
      rawCalls.push(args);
      return candidates;
    },
  };
  const assignments = {
    resolveMany: async (ids: string[]) =>
      new Map(ids.map((id) => [
        id,
        {
          pointId: id,
          technicianId: owners[id]?.technicianId ?? null,
          source: owners[id]?.source ?? 'REGION',
          assignmentId: null,
        },
      ])),
  };
  return {
    service: new PointSpatialService(prisma as never, assignments as never),
    rawCalls,
  };
}

test('nearby assigned validates coordinate, radius and limit bounds before querying', async () => {
  const h = harness([], {});

  const cases = [
    { latitude: undefined, longitude: 27 },
    { latitude: 91, longitude: 27 },
    { latitude: 38, longitude: -181 },
    { latitude: 38, longitude: 27, radiusMeters: 0 },
    { latitude: 38, longitude: 27, radiusMeters: 50001 },
    { latitude: 38, longitude: 27, radiusMeters: 1.5 },
    { latitude: 38, longitude: 27, limit: 0 },
    { latitude: 38, longitude: 27, limit: 101 },
    { latitude: 38, longitude: 27, limit: 2.5 },
  ];

  for (const input of cases) {
    await assert.rejects(
      () => h.service.nearbyAssigned('tech-1', input),
      BadRequestException,
    );
  }
  assert.equal(h.rawCalls.length, 0);
});

test('nearby assigned uses defaults and filters ownership before applying limit', async () => {
  const h = harness(
    [candidate('other-near', 100), candidate('mine-1', 200), candidate('mine-2', 300)],
    {
      'other-near': { technicianId: 'tech-2', source: 'REGION' },
      'mine-1': { technicianId: 'tech-1', source: 'TEMPORARY' },
      'mine-2': { technicianId: 'tech-1', source: 'POINT_OVERRIDE' },
    },
  );

  const result = await h.service.nearbyAssigned(
    'tech-1',
    { latitude: '38.4192', longitude: '27.1287', limit: '1' },
    new Date('2026-09-17T09:00:00+03:00'),
  );

  assert.equal(result.radiusMeters, 5000);
  assert.equal(result.limit, 1);
  assert.equal(result.count, 1);
  assert.deepEqual(result.items.map((item) => item.id), ['mine-1']);
  assert.equal(result.items[0].distanceMeters, 200);
  assert.equal(result.items[0].assignmentSource, 'TEMPORARY');
  assert.equal(h.rawCalls.length, 1);
});

test('nearby assigned preserves nearest-first order and rounds distances', async () => {
  const h = harness(
    [candidate('p1', 100.6), candidate('p2', 201.4)],
    {
      p1: { technicianId: 'tech-1', source: 'REGION' },
      p2: { technicianId: 'tech-1', source: 'POINT_OVERRIDE' },
    },
  );

  const result = await h.service.nearbyAssigned('tech-1', {
    latitude: 38.4192,
    longitude: 27.1287,
    radiusMeters: 10000,
    limit: 50,
  });

  assert.deepEqual(result.items.map((item) => item.id), ['p1', 'p2']);
  assert.deepEqual(result.items.map((item) => item.distanceMeters), [101, 201]);
});

test('nearby assigned returns an empty contract when the spatial query has no candidates', async () => {
  const h = harness([], {});
  const result = await h.service.nearbyAssigned('tech-1', {
    latitude: 38.4192,
    longitude: 27.1287,
  });
  assert.equal(result.count, 0);
  assert.deepEqual(result.items, []);
});
