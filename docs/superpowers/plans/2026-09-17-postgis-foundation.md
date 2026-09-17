# PostGIS Foundation and Nearby Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an indexed PostGIS geography projection for service points and a technician-only endpoint that returns the technician's effective assigned active points within a radius, nearest first.

**Architecture:** Existing decimal latitude/longitude fields remain the only writable coordinate source. A manual Prisma migration adds a stored generated `geography(Point,4326)` column and GiST index; a focused `PointSpatialService` uses parameterized Prisma raw SQL for `ST_DWithin` and `ST_Distance`, then delegates effective ownership to `AssignmentsService`.

**Tech Stack:** PostgreSQL 16, PostGIS 3.4, Prisma, NestJS, TypeScript, Node.js 22 test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-17-postgis-foundation-design.md`

## Global Constraints

- Production path is `/opt/field-maintenance/app`; do not change production before PR merge and post-merge exact-SHA CI success.
- Never run `git reset --hard`, `git clean`, a broad checkout, or a wholesale overwrite in production.
- Preserve production-only hotfixes through blob/hash comparison and selective deployment.
- Use RED → expected failure → minimal GREEN → full regression → exact feature-SHA CI `completed/success` → merge → exact merge-SHA CI `completed/success` → selective production deployment.
- Never call queued or in-progress CI green or complete.
- Keep `canonicalLatitude` and `canonicalLongitude` as the only writable point coordinates.
- Use `geography(Point,4326)`; radius and distance are meters.
- Nearby defaults: radius 5,000 meters and limit 50.
- Nearby bounds: latitude -90..90, longitude -180..180, integer radius 1..50,000, integer limit 1..100.
- Only the authenticated technician's effective active, non-deleted, located points may be returned.
- Mobile files are out of scope.
- SAP automation files and configuration are out of scope.
- No dependency upgrade is planned.
- Production lint/build must pass before restart.
- Do not display secrets, tokens, passwords, keys, connection strings, or customer records.

---

## File Map

**Create**

- `apps/api/prisma/migrations/20260917130000_point_postgis_location/migration.sql` — validates existing coordinates and adds constraints, generated geography, and GiST index.
- `apps/api/src/points/point-postgis-migration.spec.ts` — static migration contract test that fails when required SQL is absent.
- `apps/api/src/points/point-spatial.service.ts` — input validation, indexed spatial candidate query, effective assignment filtering, and response shaping.
- `apps/api/src/points/point-spatial.service.spec.ts` — isolated service behavior and raw-query contract tests.
- `apps/api/src/points/points.nearby.controller.spec.ts` — controller current-user/role/query wiring contract.
- `apps/api/src/points/point-spatial.integration.spec.ts` — real migrated PostGIS query test.
- `.github/workflows/postgis-ci.yml` — PostgreSQL/PostGIS integration workflow.

**Modify**

- `apps/api/src/points/points.module.ts` — register and export `PointSpatialService`.
- `apps/api/src/points/points.controller.ts` — add technician-only static `GET /points/nearby` route before `:id`.
- `.github/workflows/operations-ci.yml` — add Prisma path triggers and new point tests.
- `docs/V1_TODO.md` — mark real PostGIS usage complete only after the first exact feature-SHA CI gate succeeds.

**Do not modify**

- `apps/api/prisma/schema.prisma` — the generated PostGIS column stays migration-owned and accessed only by raw SQL.
- Any file under `apps/mobile/**`.
- Any SAP automation source, timer, service, environment, or credential file.

---

### Task 0: Recreate the Isolated Worktree and Prove the Baseline

**Files:**
- No source changes.
- Worktree: `/tmp/fmp-postgis-foundation`
- Branch: `feat/postgis-foundation`

**Interfaces:**
- Consumes: GitHub `main`, exact-SHA workflow state, and the existing remote feature branch containing this spec and plan.
- Produces: a clean isolated worktree with dependencies installed and a green pre-feature baseline.

- [ ] **Step 1: Re-read GitHub main and exact-SHA CI**

Read the current GitHub `main` SHA. Fetch all workflow runs whose `head_sha` exactly equals that SHA. Require every expected current-main workflow to be `status=completed` and `conclusion=success`. If `main` has advanced beyond the plan base, stop and compare the new commits before rebasing or changing the feature branch.

- [ ] **Step 2: Inspect production checkout without modifying it**

```bash
cd /opt/field-maintenance/app
git rev-parse HEAD
git branch --show-current
git status --short --branch
git worktree list --porcelain
```

Do not clean, reset, checkout, or overwrite production.

- [ ] **Step 3: Fetch refs and create the isolated worktree**

```bash
cd /opt/field-maintenance/app
git fetch origin main feat/postgis-foundation
if git show-ref --verify --quiet refs/heads/feat/postgis-foundation; then
  git worktree add /tmp/fmp-postgis-foundation feat/postgis-foundation
else
  git worktree add --track -b feat/postgis-foundation /tmp/fmp-postgis-foundation origin/feat/postgis-foundation
fi
```

Expected: `/tmp/fmp-postgis-foundation` is on `feat/postgis-foundation`, its HEAD equals the remote feature head, and `git status --short` is empty.

- [ ] **Step 4: Install exact dependencies and generate Prisma Client**

```bash
cd /tmp/fmp-postgis-foundation
npm ci
npm --prefix apps/api run prisma:generate
```

Expected: both exit 0. Do not run `npm audit fix` or change dependency versions.

- [ ] **Step 5: Run the existing Operations baseline**

```bash
cd /tmp/fmp-postgis-foundation/apps/api
node --test --require ts-node/register   src/points/points.bulk-update.spec.ts   src/points/point-address-discovery.service.spec.ts
```

Expected: all existing point tests PASS.

- [ ] **Step 6: Run the existing Reporting baseline**

```bash
node --test --require ts-node/register   src/maintenance/maintenance-engine.service.spec.ts   src/maintenance/paperwork-analytics.spec.ts   src/maintenance/daily-admin-summary.spec.ts   src/maintenance/period-admin-summary.spec.ts   src/maintenance/technician-daily-summary.spec.ts   src/maintenance/kpi-reporting.spec.ts
```

Expected: all existing reporting tests PASS.

- [ ] **Step 7: Run baseline lint and production builds**

```bash
cd /tmp/fmp-postgis-foundation
npm --prefix apps/api run lint
npm --prefix apps/api run build
npm --prefix apps/admin run lint
npm --prefix apps/admin run build
git diff --check
```

Expected: every command exits 0. If any baseline command fails, stop and report the pre-existing failure before writing production code.

---

### Task 1: Establish the PostGIS Migration Contract

**Files:**
- Create: `apps/api/src/points/point-postgis-migration.spec.ts`
- Create: `apps/api/prisma/migrations/20260917130000_point_postgis_location/migration.sql`

**Interfaces:**
- Consumes: existing `points.canonical_latitude` and `points.canonical_longitude`.
- Produces: database column `points.location geography(Point,4326)`, constraints `points_canonical_coordinate_pair_ck`, `points_canonical_latitude_ck`, `points_canonical_longitude_ck`, and index `points_location_gist_idx`.

- [ ] **Step 1: Write the failing migration contract test**

Create `apps/api/src/points/point-postgis-migration.spec.ts`:

```typescript
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20260917130000_point_postgis_location/migration.sql',
);

test('point PostGIS migration validates coordinates and creates generated indexed geography', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "postgis"/i);
  assert.match(sql, /points_canonical_coordinate_pair_ck/i);
  assert.match(sql, /points_canonical_latitude_ck/i);
  assert.match(sql, /points_canonical_longitude_ck/i);
  assert.match(sql, /"location" geography\(Point,\s*4326\)/i);
  assert.match(sql, /GENERATED ALWAYS AS/i);
  assert.match(sql, /ST_SetSRID\s*\(\s*ST_MakePoint/i);
  assert.match(sql, /canonical_longitude.*canonical_latitude/is);
  assert.match(sql, /points_location_gist_idx/i);
  assert.match(sql, /USING GIST\s*\(\s*"location"\s*\)/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd /tmp/fmp-postgis-foundation/apps/api
node --test --require ts-node/register src/points/point-postgis-migration.spec.ts
```

Expected: FAIL with `ENOENT` for `20260917130000_point_postgis_location/migration.sql`. This is the expected missing-feature failure.

- [ ] **Step 3: Add the minimal migration**

Create `apps/api/prisma/migrations/20260917130000_point_postgis_location/migration.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "postgis";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "points"
    WHERE
      ("canonical_latitude" IS NULL) <> ("canonical_longitude" IS NULL)
      OR ("canonical_latitude" IS NOT NULL AND ("canonical_latitude" < -90 OR "canonical_latitude" > 90))
      OR ("canonical_longitude" IS NOT NULL AND ("canonical_longitude" < -180 OR "canonical_longitude" > 180))
  ) THEN
    RAISE EXCEPTION 'points contains invalid canonical coordinate pairs';
  END IF;
END
$$;

ALTER TABLE "points"
  ADD CONSTRAINT "points_canonical_coordinate_pair_ck"
    CHECK (("canonical_latitude" IS NULL) = ("canonical_longitude" IS NULL)),
  ADD CONSTRAINT "points_canonical_latitude_ck"
    CHECK ("canonical_latitude" IS NULL OR "canonical_latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "points_canonical_longitude_ck"
    CHECK ("canonical_longitude" IS NULL OR "canonical_longitude" BETWEEN -180 AND 180);

ALTER TABLE "points"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "canonical_latitude" IS NULL THEN NULL
      ELSE ST_SetSRID(
        ST_MakePoint(
          "canonical_longitude"::double precision,
          "canonical_latitude"::double precision
        ),
        4326
      )::geography
    END
  ) STORED;

CREATE INDEX "points_location_gist_idx"
  ON "points"
  USING GIST ("location");
```

- [ ] **Step 4: Run the migration contract test and Prisma validation**

Run:

```bash
cd /tmp/fmp-postgis-foundation
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run prisma:validate
cd apps/api
node --test --require ts-node/register src/points/point-postgis-migration.spec.ts
```

Expected: Prisma generate/validate PASS and the migration contract test PASS.

- [ ] **Step 5: Commit the migration contract**

```bash
git add apps/api/prisma/migrations/20260917130000_point_postgis_location/migration.sql apps/api/src/points/point-postgis-migration.spec.ts
git commit -m "feat: add indexed point geography migration"
```

---

### Task 2: Implement the Spatial Candidate Service with TDD

**Files:**
- Create: `apps/api/src/points/point-spatial.service.spec.ts`
- Create: `apps/api/src/points/point-spatial.service.ts`

**Interfaces:**
- Consumes: `PrismaService.$queryRaw`; `AssignmentsService.resolveMany(pointIds: string[], asOf?: Date)`.
- Produces:
  - `NearbyPointsInput`
  - `NearbyPointItem`
  - `NearbyPointsResult`
  - `PointSpatialService.nearbyAssigned(technicianId: string, input: NearbyPointsInput, asOf?: Date): Promise<NearbyPointsResult>`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/points/point-spatial.service.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
cd /tmp/fmp-postgis-foundation/apps/api
node --test --require ts-node/register src/points/point-spatial.service.spec.ts
```

Expected: compilation failure `Cannot find module './point-spatial.service'`. This is the expected missing-service failure.

- [ ] **Step 3: Add the minimal spatial service**

Create `apps/api/src/points/point-spatial.service.ts`:

```typescript
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
```

- [ ] **Step 4: Run service tests and verify GREEN**

Run:

```bash
cd /tmp/fmp-postgis-foundation/apps/api
node --test --require ts-node/register src/points/point-spatial.service.spec.ts
```

Expected: 4 tests PASS, 0 failures.

- [ ] **Step 5: Run API typecheck**

Run:

```bash
cd /tmp/fmp-postgis-foundation
npm --prefix apps/api run lint
```

Expected: PASS. If TypeScript narrows `assignmentSource` more strictly than `string`, introduce and reuse the exact union `'TEMPORARY' | 'POINT_OVERRIDE' | 'REGION'`; do not weaken unrelated types.

- [ ] **Step 6: Commit the service**

```bash
git add apps/api/src/points/point-spatial.service.ts apps/api/src/points/point-spatial.service.spec.ts
git commit -m "feat: query nearby assigned points with PostGIS"
```

---

### Task 3: Expose the Technician-Only Nearby Route

**Files:**
- Create: `apps/api/src/points/points.nearby.controller.spec.ts`
- Modify: `apps/api/src/points/points.controller.ts`
- Modify: `apps/api/src/points/points.module.ts`

**Interfaces:**
- Consumes: `PointSpatialService.nearbyAssigned()`; `CurrentUser`; `UserRole.TECHNICIAN`.
- Produces: `GET /api/points/nearby`.

- [ ] **Step 1: Write the failing controller test**

Create `apps/api/src/points/points.nearby.controller.spec.ts`:

```typescript
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/auth.constants';
import { PointsController } from './points.controller';

test('nearby route forwards current technician and query values to the spatial service', async () => {
  const calls: unknown[][] = [];
  const spatial = {
    nearbyAssigned: async (...args: unknown[]) => {
      calls.push(args);
      return { count: 0, items: [] };
    },
  };
  const controller = new PointsController(
    {} as never,
    {} as never,
    spatial as never,
  );

  const result = await controller.nearby(
    { id: 'tech-1', role: UserRole.TECHNICIAN } as never,
    '38.4192',
    '27.1287',
    '5000',
    '25',
  );

  assert.deepEqual(calls, [[
    'tech-1',
    {
      latitude: '38.4192',
      longitude: '27.1287',
      radiusMeters: '5000',
      limit: '25',
    },
  ]]);
  assert.deepEqual(result, { count: 0, items: [] });

  const roles = Reflect.getMetadata(ROLES_KEY, PointsController.prototype.nearby);
  assert.deepEqual(roles, [UserRole.TECHNICIAN]);
});
```

- [ ] **Step 2: Run the controller test and verify RED**

Run:

```bash
cd /tmp/fmp-postgis-foundation/apps/api
node --test --require ts-node/register src/points/points.nearby.controller.spec.ts
```

Expected: TypeScript failure because `PointsController` has no third constructor argument and no `nearby` method.

- [ ] **Step 3: Register the service in the module**

Modify `apps/api/src/points/points.module.ts` to import `PointSpatialService`, then use:

```typescript
@Module({
  imports: [AssignmentsModule],
  controllers: [PointsController],
  providers: [PointsService, PointAddressDiscoveryService, PointSpatialService],
  exports: [PointsService, PointAddressDiscoveryService, PointSpatialService],
})
export class PointsModule {}
```

- [ ] **Step 4: Add the static nearby route before the dynamic `:id` route**

Modify the controller constructor:

```typescript
constructor(
  private readonly points: PointsService,
  private readonly addressDiscovery: PointAddressDiscoveryService,
  private readonly spatial: PointSpatialService,
) {}
```

Add this method before `@Get(':id')`:

```typescript
@Roles(UserRole.TECHNICIAN)
@Get('nearby')
nearby(
  @CurrentUser() user: AuthenticatedUser,
  @Query('latitude') latitude?: string,
  @Query('longitude') longitude?: string,
  @Query('radiusMeters') radiusMeters?: string,
  @Query('limit') limit?: string,
) {
  return this.spatial.nearbyAssigned(user.id, {
    latitude,
    longitude,
    radiusMeters,
    limit,
  });
}
```

Add:

```typescript
import { PointSpatialService } from './point-spatial.service';
```

- [ ] **Step 5: Run the controller and service tests**

Run:

```bash
cd /tmp/fmp-postgis-foundation/apps/api
node --test --require ts-node/register   src/points/point-spatial.service.spec.ts   src/points/points.nearby.controller.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Run API lint and build**

```bash
cd /tmp/fmp-postgis-foundation
npm --prefix apps/api run lint
npm --prefix apps/api run build
```

Expected: both PASS.

- [ ] **Step 7: Commit the route**

```bash
git add apps/api/src/points/points.controller.ts apps/api/src/points/points.module.ts apps/api/src/points/points.nearby.controller.spec.ts
git commit -m "feat: expose technician nearby points endpoint"
```

---

### Task 4: Prove the Feature Against Real PostGIS

**Files:**
- Create: `apps/api/src/points/point-spatial.integration.spec.ts`
- Create: `.github/workflows/postgis-ci.yml`
- Modify: `.github/workflows/operations-ci.yml`

**Interfaces:**
- Consumes: migrated PostgreSQL/PostGIS database through `DATABASE_URL`.
- Produces: a real database proof for generated coordinates, radius exclusion, nearest-first ordering, assignment filtering, and GiST-index existence.

- [ ] **Step 1: Write the real integration test**

Create `apps/api/src/points/point-spatial.integration.spec.ts`:

```typescript
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
```

Before committing, compare required `User` fields against the generated Prisma type. If the repository's authentication migrations require a different non-secret password field name, use the exact schema field already present; keep the fixture value test-only.

- [ ] **Step 2: Run integration test before a migrated PostGIS database and record expected RED**

Run in an environment where the migration has not yet been applied:

```bash
cd /tmp/fmp-postgis-foundation/apps/api
node --test --require ts-node/register src/points/point-spatial.integration.spec.ts
```

Expected: FAIL because `points.location` or `points_location_gist_idx` is absent. If no database is available locally, the authoritative RED is the first PostGIS CI run before adding the migration-deploy step; do not reinterpret a connection failure as the required feature failure.

- [ ] **Step 3: Add the PostGIS workflow**

Create `.github/workflows/postgis-ci.yml`:

```yaml
name: PostGIS CI

on:
  push:
    paths:
      - 'apps/api/prisma/**'
      - 'apps/api/src/points/point-postgis-migration.spec.ts'
      - 'apps/api/src/points/point-spatial.service.ts'
      - 'apps/api/src/points/point-spatial.service.spec.ts'
      - 'apps/api/src/points/point-spatial.integration.spec.ts'
      - 'apps/api/src/points/points.controller.ts'
      - 'apps/api/src/points/points.module.ts'
      - 'apps/api/src/points/points.nearby.controller.spec.ts'
      - 'docs/V1_TODO.md'
      - '.github/workflows/postgis-ci.yml'
  pull_request:
    paths:
      - 'apps/api/prisma/**'
      - 'apps/api/src/points/point-postgis-migration.spec.ts'
      - 'apps/api/src/points/point-spatial.service.ts'
      - 'apps/api/src/points/point-spatial.service.spec.ts'
      - 'apps/api/src/points/point-spatial.integration.spec.ts'
      - 'apps/api/src/points/points.controller.ts'
      - 'apps/api/src/points/points.module.ts'
      - 'apps/api/src/points/points.nearby.controller.spec.ts'
      - 'docs/V1_TODO.md'
      - '.github/workflows/postgis-ci.yml'

jobs:
  postgis-validation:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: field_maintenance_test
          POSTGRES_USER: field_maintenance
          POSTGRES_PASSWORD: local-ci-only
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U field_maintenance -d field_maintenance_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://field_maintenance:local-ci-only@127.0.0.1:5432/field_maintenance_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Generate Prisma client
        run: npm --prefix apps/api run prisma:generate
      - name: Deploy all migrations
        run: npm --prefix apps/api run prisma:deploy
      - name: Migration and spatial unit contracts
        working-directory: apps/api
        run: >-
          node --test --require ts-node/register
          src/points/point-postgis-migration.spec.ts
          src/points/point-spatial.service.spec.ts
          src/points/points.nearby.controller.spec.ts
      - name: Real PostGIS integration
        working-directory: apps/api
        run: node --test --require ts-node/register src/points/point-spatial.integration.spec.ts
      - name: API typecheck
        run: npm --prefix apps/api run lint
      - name: API build
        run: npm --prefix apps/api run build
```

The CI password above is a disposable local service value, not a production secret.

- [ ] **Step 4: Extend Operations CI triggers and point tests**

Add these trigger paths to both `push.paths` and `pull_request.paths` in `.github/workflows/operations-ci.yml`:

```yaml
      - 'apps/api/prisma/**'
      - '.github/workflows/postgis-ci.yml'
```

Replace the point test command with:

```yaml
      - name: Point operation regression tests
        working-directory: apps/api
        run: >-
          node --test --require ts-node/register
          src/points/points.bulk-update.spec.ts
          src/points/point-address-discovery.service.spec.ts
          src/points/point-postgis-migration.spec.ts
          src/points/point-spatial.service.spec.ts
          src/points/points.nearby.controller.spec.ts
```

Do not add the real integration spec to Operations CI because only PostGIS CI provisions a database.

- [ ] **Step 5: Run all new non-database tests locally**

```bash
cd /tmp/fmp-postgis-foundation/apps/api
node --test --require ts-node/register   src/points/point-postgis-migration.spec.ts   src/points/point-spatial.service.spec.ts   src/points/points.nearby.controller.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Run real integration locally if Docker is available**

```bash
cd /tmp/fmp-postgis-foundation
docker compose up -d postgres
npm --prefix apps/api run prisma:deploy
cd apps/api
node --test --require ts-node/register src/points/point-spatial.integration.spec.ts
```

Expected: 2 tests PASS. Do not tear down with volume deletion. If Docker is unavailable, push the implementation branch and use the PostGIS CI service as the required real-database proof.

- [ ] **Step 7: Commit the integration and CI gate**

```bash
git add apps/api/src/points/point-spatial.integration.spec.ts .github/workflows/postgis-ci.yml .github/workflows/operations-ci.yml
git commit -m "test: verify nearby points against PostGIS"
```

---

### Task 5: Run the Full Local Regression Gate

**Files:**
- No intended source changes.
- Inspect all branch changes with `git diff` before continuing.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: fresh local evidence for every relevant regression and build.

- [ ] **Step 1: Confirm worktree isolation and scope**

```bash
cd /tmp/fmp-postgis-foundation
git status --short --branch
git diff --name-only origin/main...HEAD
```

Expected: branch `feat/postgis-foundation`; no mobile or SAP automation files; no unrelated files.

- [ ] **Step 2: Generate Prisma Client and validate schema**

```bash
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run prisma:validate
```

Expected: PASS.

- [ ] **Step 3: Run point/PostGIS contracts**

```bash
cd apps/api
node --test --require ts-node/register   src/points/points.bulk-update.spec.ts   src/points/point-address-discovery.service.spec.ts   src/points/point-postgis-migration.spec.ts   src/points/point-spatial.service.spec.ts   src/points/points.nearby.controller.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Run maintenance/reporting regressions**

```bash
node --test --require ts-node/register   src/maintenance/maintenance-engine.service.spec.ts   src/maintenance/paperwork-analytics.spec.ts   src/maintenance/daily-admin-summary.spec.ts   src/maintenance/period-admin-summary.spec.ts   src/maintenance/technician-daily-summary.spec.ts   src/maintenance/kpi-reporting.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run API and Admin lint/build**

```bash
cd /tmp/fmp-postgis-foundation
npm --prefix apps/api run lint
npm --prefix apps/api run build
npm --prefix apps/admin run lint
npm --prefix apps/admin run build
```

Expected: all four commands PASS.

- [ ] **Step 6: Run formatting, secret, and scope checks**

```bash
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD | grep '^apps/mobile/' && exit 1 || true
git diff --name-only origin/main...HEAD | grep -E 'sap|SAP' && exit 1 || true
git diff --unified=0 origin/main...HEAD | grep -E '^[+].*(PASSWORD|SECRET|TOKEN|API_KEY)=' && exit 1 || true
```

Expected: no whitespace errors, no mobile changes, no SAP changes, and no credential assignments. The fixed disposable CI database password may appear in workflow YAML; verify it is exactly `local-ci-only` and not sourced from any environment.

- [ ] **Step 7: Verify the worktree is clean after committed work**

```bash
git status --short
```

Expected: no output.

---

### Task 6: Feature-SHA CI Gate, Then Close the TODO

**Files:**
- Modify only after the first exact feature-SHA CI succeeds: `docs/V1_TODO.md`

**Interfaces:**
- Consumes: pushed feature SHA and GitHub Actions results.
- Produces: final feature head with roadmap completion and a second exact-SHA CI proof.

- [ ] **Step 1: Push the feature branch and record exact SHA**

```bash
cd /tmp/fmp-postgis-foundation
git push -u origin feat/postgis-foundation
git rev-parse HEAD
```

Record the full SHA as `FEATURE_CODE_SHA` without printing credentials.

- [ ] **Step 2: Wait for all workflows on the exact code SHA**

Required workflows for `FEATURE_CODE_SHA`:

- Operations CI
- PostGIS CI

If another path-triggered workflow appears, it is also required. Poll until each is exactly `status=completed` and `conclusion=success`. Do not continue while any run is queued or in progress.

- [ ] **Step 3: Mark PostGIS complete only after the exact code SHA is green**

Change this line in `docs/V1_TODO.md`:

```markdown
- [ ] PostgreSQL/PostGIS migrations — PostgreSQL/Prisma migrations are active; PostGIS itself is not yet used
```

to:

```markdown
- [x] PostgreSQL/PostGIS migrations — point coordinates now project into indexed PostGIS geography and power the technician-only nearby-points API
```

Remove the completed PostGIS item from near-term priority #1 and renumber the remaining non-mobile-first priorities without moving mobile work earlier.

- [ ] **Step 4: Commit and push the TODO closure**

```bash
git add docs/V1_TODO.md
git commit -m "docs: close PostGIS foundation roadmap item"
git push
git rev-parse HEAD
```

Record the full SHA as `FEATURE_FINAL_SHA`.

- [ ] **Step 5: Wait for every workflow on the final exact SHA**

Because `docs/V1_TODO.md` triggers Operations, Reporting, and PostGIS workflows, require all three for `FEATURE_FINAL_SHA`:

- Operations CI: `completed/success`
- Reporting CI: `completed/success`
- PostGIS CI: `completed/success`

Do not open or merge the PR until all are complete and successful.

---

### Task 7: Review, PR, Merge, and Post-Merge Exact-SHA Gate

**Files:**
- No source changes unless review finds a defect; every defect fix starts with a failing regression test.

**Interfaces:**
- Consumes: final feature branch and exact-SHA CI evidence.
- Produces: reviewed PR, merge SHA, and post-merge CI evidence.

- [ ] **Step 1: Perform independent code review**

Use `superpowers:requesting-code-review`. Review:

- generated-column migration safety;
- no silent coordinate rewriting;
- parameterized raw SQL only;
- `ST_DWithin` and `ST_Distance` geography semantics;
- no SQL limit before assignment filtering;
- current-user identity and technician-only role;
- static route placement before `:id`;
- integration-test cleanup;
- workflow path coverage;
- mobile and SAP exclusions.

Any finding requires a test that fails for the defect before the fix is written. Re-run Task 5 and the exact feature-SHA CI gate after changes.

- [ ] **Step 2: Create the PR**

Create a PR from `feat/postgis-foundation` to `main` titled:

```text
Add PostGIS nearby-points foundation
```

The body must summarize migration safety, endpoint authorization, real PostGIS CI evidence, no mobile changes, no SAP changes, and the exact successful workflow run IDs.

- [ ] **Step 3: Inspect the PR diff and mergeability**

Verify the PR contains only:

- design/plan documentation;
- the migration and migration contract;
- spatial service/tests;
- controller/module wiring;
- PostGIS/Operations CI changes;
- final TODO update.

Require GitHub mergeability to be true and all current head checks to remain `completed/success`.

- [ ] **Step 4: Merge with exact-head protection**

Merge only if the PR head SHA equals `FEATURE_FINAL_SHA`. Read the returned merge SHA and then read `main` again; require them to match. Record as `MERGE_SHA`.

- [ ] **Step 5: Wait for post-merge exact-SHA CI**

For `MERGE_SHA`, wait for:

- Operations CI: `completed/success`
- Reporting CI: `completed/success`
- PostGIS CI: `completed/success`

If a workflow is queued or in progress, the task is not ready for production.

---

### Task 8: Selective Production Deployment and Verification

**Files:**
- Selectively deploy only merged production targets:
  - `apps/api/prisma/migrations/20260917130000_point_postgis_location/migration.sql`
  - `apps/api/src/points/point-spatial.service.ts`
  - `apps/api/src/points/points.controller.ts`
  - `apps/api/src/points/points.module.ts`
  - `docs/V1_TODO.md`
- Test files, workflows, design, and plan do not need runtime deployment.

**Interfaces:**
- Consumes: `MERGE_SHA` with post-merge exact-SHA CI success.
- Produces: migrated production database, healthy API/Admin services, authenticated nearby-point smoke evidence, rollback backup, and verified source hashes.

- [ ] **Step 1: Read-only production preflight**

From `/opt/field-maintenance/app`, collect without exposing secrets:

```bash
git rev-parse HEAD
git branch --show-current
git status --short --branch
git fetch origin main
git rev-parse origin/main
```

Require `origin/main == MERGE_SHA`. Inspect each target file against the merge base and `MERGE_SHA`; stop if any production target differs from the merge-base blob unless the difference is deliberately preserved.

Query production PostgreSQL through the already configured application environment without printing `DATABASE_URL`:

```sql
SHOW server_version;
SELECT default_version FROM pg_available_extensions WHERE name = 'postgis';
SELECT extversion FROM pg_extension WHERE extname = 'postgis';
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY finished_at DESC
LIMIT 5;
SELECT count(*) AS invalid_coordinate_rows
FROM "points"
WHERE
  ("canonical_latitude" IS NULL) <> ("canonical_longitude" IS NULL)
  OR ("canonical_latitude" IS NOT NULL AND ("canonical_latitude" < -90 OR "canonical_latitude" > 90))
  OR ("canonical_longitude" IS NOT NULL AND ("canonical_longitude" < -180 OR "canonical_longitude" > 180));
```

Require PostGIS available, extension installed or safely creatable, and `invalid_coordinate_rows = 0`. Stop before deployment otherwise.

- [ ] **Step 2: Create rollback backup**

Create:

```text
/opt/field-maintenance/backups/postgis-foundation-predeploy-YYYYMMDD-HHMMSS
```

Include:

- copies of all existing target runtime source files;
- a manifest recording files absent before deployment;
- API `dist`;
- Admin `.next`;
- `git status --short --branch`;
- current target hashes;
- migration history output without connection strings;
- a schema-only dump for `points`, related constraints/index definitions, and `_prisma_migrations` metadata.

Do not copy or print environment files.

- [ ] **Step 3: Selectively deploy exact merged blobs**

For each runtime target, compare the production blob/hash first, then write only the exact `MERGE_SHA` version. Do not use broad checkout, reset, clean, or directory replacement.

Verify each deployed source hash against `MERGE_SHA`.

- [ ] **Step 4: Generate and build before migration/restart**

```bash
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run lint
npm --prefix apps/api run build
npm --prefix apps/admin run lint
npm --prefix apps/admin run build
```

Require all commands to exit 0. Do not restart or apply the migration if any fails.

- [ ] **Step 5: Apply the migration**

Run the existing production-safe Prisma deploy command:

```bash
npm --prefix apps/api run prisma:deploy
```

Require exit 0 and verify migration `20260917130000_point_postgis_location` is recorded successful.

- [ ] **Step 6: Verify PostGIS database objects read-only**

Run:

```sql
SELECT extversion FROM pg_extension WHERE extname = 'postgis';

SELECT
  column_name,
  udt_name,
  is_generated,
  generation_expression
FROM information_schema.columns
WHERE table_name = 'points' AND column_name = 'location';

SELECT indexdef
FROM pg_indexes
WHERE tablename = 'points' AND indexname = 'points_location_gist_idx';

SELECT
  count(*) FILTER (WHERE "canonical_latitude" IS NOT NULL) AS located_points,
  count(*) FILTER (WHERE "location" IS NOT NULL) AS projected_points
FROM "points";
```

Require `located_points = projected_points`, generated location present, and GiST index present.

Run a read-only `ST_DWithin` smoke inside a read-only transaction using one valid located point as the origin; expose only counts and rounded distances, not customer names or coordinates.

- [ ] **Step 7: Restart only after build and migration success**

Restart only the API and Admin application services. Do not touch SAP units.

Verify for both services:

- `ActiveState=active`
- `SubState=running`
- `Result=success`
- `NRestarts=0`

- [ ] **Step 8: Run public and authenticated smoke checks**

Require:

- `https://api.field-maintenance-prod.com/api/health` → HTTP 200 and DB `ok`;
- `https://field-maintenance-prod.com` → HTTP 200;
- unauthenticated `GET /api/points/nearby?... ` → HTTP 401;
- authenticated technician read-only nearby call returns the documented contract;
- returned items, if any, all belong to the authenticated technician's effective assignment and are nearest first.

Do not display credentials, tokens, point names, exact coordinates, or other customer data in logs/reporting.

- [ ] **Step 9: Check journals, SAP health, hashes, and cleanup**

Require recent API/Admin error-marker count 0. Confirm the SAP timer remains healthy and the last SAP sync has `Result=success` and `ExecMainStatus=0`; do not modify or restart SAP.

Verify all deployed runtime source hashes match `MERGE_SHA`.

Only after every production check passes:

```bash
git worktree remove /tmp/fmp-postgis-foundation
git branch -d feat/postgis-foundation
```

Do not delete the rollback backup.

- [ ] **Step 10: Final completion evidence**

Report:

- PR number and URL;
- final feature SHA;
- exact feature workflow names, run IDs, and `completed/success`;
- merge SHA;
- exact post-merge workflow names, run IDs, and `completed/success`;
- backup path;
- production build results;
- migration version and object verification;
- service state and restart counts;
- health/Admin/unauthenticated endpoint HTTP results;
- redacted authenticated read-only nearby smoke result;
- journal error counts;
- SAP health;
- source-hash verification;
- worktree/branch cleanup.

Do not call the task production-complete until every item above has fresh evidence.
