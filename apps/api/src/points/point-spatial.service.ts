import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AssignmentsService } from '../assignments/assignments.service';
import { PrismaService } from '../prisma/prisma.service';

export type NearbyPointsInput = {
  latitude: string | number | undefined;
  longitude: string | number | undefined;
  radiusMeters?: string | number;
  limit?: string | number;
};

export type NearbyPointItem = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  regionId: string | null;
  regionName: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  assignmentSource: string;
};

export type NearbyPointsResult = {
  origin: { latitude: number; longitude: number };
  radiusMeters: number;
  limit: number;
  count: number;
  items: NearbyPointItem[];
};

type SpatialCandidate = Omit<NearbyPointItem, 'distanceMeters' | 'assignmentSource'> & {
  distanceMeters: number;
};

@Injectable()
export class PointSpatialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  async nearbyAssigned(
    technicianId: string,
    input: NearbyPointsInput,
    asOf = new Date(),
  ): Promise<NearbyPointsResult> {
    const latitude = this.requiredNumber(input.latitude, 'latitude', -90, 90);
    const longitude = this.requiredNumber(input.longitude, 'longitude', -180, 180);
    const radiusMeters = this.boundedInteger(input.radiusMeters ?? 5000, 'radiusMeters', 1, 50000);
    const limit = this.boundedInteger(input.limit ?? 50, 'limit', 1, 100);

    const origin = Prisma.sql`
      ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
    `;
    const candidates = await this.prisma.$queryRaw<SpatialCandidate[]>(Prisma.sql`
      SELECT
        p."id",
        p."code",
        p."name",
        p."address",
        p."region_id" AS "regionId",
        r."name" AS "regionName",
        p."canonical_latitude"::double precision AS "latitude",
        p."canonical_longitude"::double precision AS "longitude",
        ST_Distance(p."location", ${origin})::double precision AS "distanceMeters"
      FROM "points" p
      LEFT JOIN "regions" r ON r."id" = p."region_id"
      WHERE
        p."deleted_at" IS NULL
        AND p."status" = 'ACTIVE'::"PointStatus"
        AND p."location" IS NOT NULL
        AND ST_DWithin(p."location", ${origin}, ${radiusMeters})
      ORDER BY "distanceMeters" ASC, p."name" ASC, p."code" ASC, p."id" ASC
    `);

    const resolved = await this.assignments.resolveMany(
      candidates.map((item) => item.id),
      asOf,
    );
    const items = candidates
      .filter((item) => resolved.get(item.id)?.technicianId === technicianId)
      .slice(0, limit)
      .map((item) => ({
        ...item,
        distanceMeters: Math.round(Number(item.distanceMeters)),
        assignmentSource: resolved.get(item.id)?.source ?? 'REGION',
      }));

    return {
      origin: { latitude, longitude },
      radiusMeters,
      limit,
      count: items.length,
      items,
    };
  }

  private requiredNumber(
    raw: string | number | undefined,
    field: string,
    minimum: number,
    maximum: number,
  ) {
    const value = typeof raw === 'number' ? raw : raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new BadRequestException(`${field} must be between ${minimum} and ${maximum}`);
    }
    return value;
  }

  private boundedInteger(
    raw: string | number,
    field: string,
    minimum: number,
    maximum: number,
  ) {
    const value = typeof raw === 'number' ? raw : raw.trim() === '' ? Number.NaN : Number(raw);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new BadRequestException(`${field} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
  }
}
