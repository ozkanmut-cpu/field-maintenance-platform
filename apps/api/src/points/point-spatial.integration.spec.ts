import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { MaintenanceType, PointStatus, UserRole } from '@prisma/client';
import { AssignmentsService } from '../assignments/assignments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PointSpatialService } from './point-spatial.service';

const prisma = new PrismaService();
const assignments = new AssignmentsService(prisma);
const service = new PointSpatialService(prisma, assignments);
const suffix = randomUUID().slice(0, 8);
const technicianId = randomUUID();
const otherTechnicianId = randomUUID();
const regionId = randomUUID();
const otherRegionId = randomUUID();
const pointIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

before(async () => {
  await prisma.$connect();
  await prisma.user.createMany({
    data: [
      {
        id: technicianId,
        name: `PostGIS Tech ${suffix}`,
        username: `postgis-tech-${suffix}`,
        passwordHash: 'integration-only',
        role: UserRole.TECHNICIAN,
        active: true,
      },
      {
        id: otherTechnicianId,
        name: `PostGIS Other ${suffix}`,
        username: `postgis-other-${suffix}`,
        passwordHash: 'integration-only',
        role: UserRole.TECHNICIAN,
        active: true,
      },
    ],
  });
  await prisma.region.createMany({
    data: [
      { id: regionId, name: `POSTGIS-${suffix}`, technicianId },
      { id: otherRegionId, name: `POSTGIS-OTHER-${suffix}`, technicianId: otherTechnicianId },
    ],
  });
  await prisma.point.createMany({
    data: [
      {
        id: pointIds[0],
        code: `PG-${suffix}-NEAR`,
        name: 'PostGIS Near',
        regionId,
        status: PointStatus.ACTIVE,
        maintenanceType: MaintenanceType.STANDARD,
        maintenanceWeek: 1,
        canonicalLatitude: 38.4200,
        canonicalLongitude: 27.1300,
      },
      {
        id: pointIds[1],
        code: `PG-${suffix}-FAR`,
        name: 'PostGIS Far',
        regionId,
        status: PointStatus.ACTIVE,
        maintenanceType: MaintenanceType.STANDARD,
        maintenanceWeek: 1,
        canonicalLatitude: 38.4500,
        canonicalLongitude: 27.1600,
      },
      {
        id: pointIds[2],
        code: `PG-${suffix}-OTHER`,
        name: 'PostGIS Other Owner',
        regionId: otherRegionId,
        status: PointStatus.ACTIVE,
        maintenanceType: MaintenanceType.STANDARD,
        maintenanceWeek: 1,
        canonicalLatitude: 38.4201,
        canonicalLongitude: 27.1301,
      },
      {
        id: pointIds[3],
        code: `PG-${suffix}-UNLOCATED`,
        name: 'PostGIS Unlocated',
        regionId,
        status: PointStatus.ACTIVE,
        maintenanceType: MaintenanceType.STANDARD,
        maintenanceWeek: 1,
      },
    ],
  });
});

after(async () => {
  await prisma.point.deleteMany({ where: { id: { in: pointIds } } });
  await prisma.region.deleteMany({ where: { id: { in: [regionId, otherRegionId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [technicianId, otherTechnicianId] } } });
  await prisma.$disconnect();
});

test('generated geography and GiST index exist', async () => {
  const generated = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "points"
    WHERE "id" = ${pointIds[0]}::uuid
      AND "location" IS NOT NULL
      AND ST_SRID("location"::geometry) = 4326
  `;
  assert.equal(Number(generated[0].count), 1);

  const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'points_location_gist_idx'
  `;
  assert.equal(indexes.length, 1);
  assert.match(indexes[0].indexdef, /USING gist/i);
});

test('real PostGIS query returns only assigned located points nearest first', async () => {
  const result = await service.nearbyAssigned(
    technicianId,
    {
      latitude: 38.4192,
      longitude: 27.1287,
      radiusMeters: 10000,
      limit: 10,
    },
    new Date('2026-09-17T09:00:00+03:00'),
  );

  assert.deepEqual(result.items.map((item) => item.id), [pointIds[0], pointIds[1]]);
  assert.ok(result.items[0].distanceMeters < result.items[1].distanceMeters);
  assert.ok(!result.items.some((item) => item.id === pointIds[2]));
  assert.ok(!result.items.some((item) => item.id === pointIds[3]));
});
