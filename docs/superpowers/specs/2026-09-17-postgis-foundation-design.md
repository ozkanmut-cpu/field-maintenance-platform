# PostGIS Foundation and Nearby Points — Design

**Date:** 2026-09-17
**Branch:** `feat/postgis-foundation`
**Base:** `8ff7a1924e3b23e17b81a83e0235c1db31ddb94e`

## Goal

Add real PostGIS-backed spatial querying to the existing PostgreSQL/Prisma application without changing the mobile UI. The delivered backend capability will return the authenticated technician's assigned active points within a caller-supplied radius, ordered nearest first, and will become the foundation for a later dedicated `YAKINIMDAKİLER` screen.

## Current State

- Local infrastructure already uses `postgis/postgis:16-3.4`.
- `Point` stores `canonicalLatitude` and `canonicalLongitude` as nullable `Decimal(9,6)` values.
- Google address discovery and field location learning update those decimal fields.
- Distance calculations currently happen in TypeScript with Haversine formulas.
- The initial core migration already runs `CREATE EXTENSION IF NOT EXISTS postgis`, but no spatial column, GiST index, or PostGIS-backed application query exists.
- Effective technician ownership can come from a current temporary assignment, a point override, or the point's region technician.

## Chosen Approach

Keep the existing decimal coordinates as the single writable source of truth. Add a database-generated `geography(Point,4326)` column derived from them, index it with GiST, and query it through a focused service using Prisma parameterized raw SQL.

This preserves all existing coordinate-writing flows. It avoids dual-write drift and does not require Prisma Client to write an unsupported spatial type.

### Alternatives Considered

1. **Infrastructure only:** enable PostGIS and add the spatial column/index without an application query. Rejected because the roadmap explicitly asks for real PostGIS usage, not dormant infrastructure.
2. **Duplicate detection only:** use PostGIS to preselect nearby duplicate candidates. Useful later, but less valuable than establishing the backend contract for the planned nearby-points experience.
3. **Replace decimal coordinates with geography:** rejected because it would force broad changes across Google discovery, field learning, maintenance responses, Prisma types, and mobile consumers.

## Database Design

A manual Prisma migration will:

1. Re-run the idempotent `CREATE EXTENSION IF NOT EXISTS postgis` guard so upgraded and partially provisioned environments fail safely if PostGIS is unavailable.
2. Validate existing coordinate pairs before structural changes:
   - latitude and longitude must either both be null or both be non-null;
   - latitude must be between -90 and 90;
   - longitude must be between -180 and 180.
3. Add check constraints preserving those invariants for future writes.
4. Add a nullable stored generated column named `location`:
   - null when both canonical coordinates are null;
   - otherwise `ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography`.
5. Add `points_location_gist_idx` using GiST on `location`.

The generated column is intentionally not added to `schema.prisma`. Prisma continues to own the decimal columns, while the migration owns the derived PostGIS projection. The application accesses `location` only through parameterized raw SQL.

The migration must be atomic. If production preflight finds invalid or half-populated coordinate pairs, deployment stops before `prisma migrate deploy`; records are not silently changed.

## Backend Design

Add a focused `PointSpatialService` in the points module.

### Input

`nearbyAssigned(technicianId, input)` accepts:

- `latitude`: required finite number, -90 through 90;
- `longitude`: required finite number, -180 through 180;
- `radiusMeters`: optional, default 5,000; integer from 1 through 50,000;
- `limit`: optional, default 50; integer from 1 through 100.

Invalid values produce `BadRequestException`.

### Spatial Query

The service issues a parameterized `$queryRaw` query which:

- selects non-deleted, active points with non-null `location`;
- applies `ST_DWithin(location, origin, radiusMeters)`, allowing the GiST index to restrict candidates;
- calculates meters with `ST_Distance(location, origin)`;
- orders by distance, then Turkish-facing point name/code deterministically;
- returns all candidates in the radius needed for correct assignment filtering.

The origin uses SRID 4326 and `geography`, so radius and returned distance are in meters.

### Assignment Filtering

PostGIS finds spatial candidates; the existing `AssignmentsService.resolveMany()` remains the source of truth for authorization and ownership. The service resolves every spatial candidate at one shared `asOf` timestamp, keeps only points whose effective technician is the authenticated technician, then applies the requested result limit.

This preserves temporary assignment > point override > active region technician precedence without duplicating assignment rules in SQL. The radius is capped at 50 km, so the indexed candidate set remains bounded in the current operational area.

### API Contract

Add:

`GET /api/points/nearby?latitude=...&longitude=...&radiusMeters=...&limit=...`

Authorization:

- technician role only;
- technician identity always comes from `CurrentUser`;
- no caller-supplied technician ID;
- admin access is out of scope for this endpoint.

Response:

```json
{
  "origin": { "latitude": 38.4192, "longitude": 27.1287 },
  "radiusMeters": 5000,
  "limit": 50,
  "count": 1,
  "items": [
    {
      "id": "point-uuid",
      "code": "10001",
      "name": "Örnek Nokta",
      "address": "İzmir",
      "regionId": "region-uuid",
      "regionName": "ALSANCAK",
      "latitude": 38.421,
      "longitude": 27.13,
      "distanceMeters": 278,
      "assignmentSource": "REGION"
    }
  ]
}
```

Distances are rounded to whole meters for the API response. No route duration or road distance is implied.

## Security and Privacy

- Authentication remains mandatory through the existing global guards.
- Only the authenticated technician's effective assignments are returned.
- Deleted, passive, cancelled, unlocated, and other technicians' points are excluded.
- Raw SQL values are parameterized with Prisma tagged templates; no query-string interpolation is permitted.
- No new secret or external API is introduced.
- The endpoint returns existing point business data only; it does not expose technician live location or location history.

## Error Handling

- Invalid coordinates, radius, or limit: HTTP 400.
- Inactive/non-technician account: existing technician authorization failure.
- PostGIS/database error: standard server error logging and HTTP 500; no silent TypeScript fallback. A fallback would hide a broken production spatial migration.
- No matching assigned points: HTTP 200 with `count: 0` and an empty `items` array.

## Testing Strategy

TDD order:

1. Unit/service contract tests fail because `PointSpatialService` does not exist.
2. Tests cover validation boundaries, parameterized PostGIS query use, distance ordering, assignment filtering, temporary/override behavior delegated to `AssignmentsService`, limiting after authorization filtering, and empty results.
3. Controller contract test fails before the route exists and then verifies role/current-user wiring.
4. Migration contract test verifies extension, generated geography expression, coordinate constraints, and GiST index.
5. PostGIS integration CI starts the repository's PostGIS 16/3.4 service, runs all Prisma migrations, inserts controlled points, proves `ST_DWithin` inclusion/exclusion and nearest-first meter distances, and checks the index exists.
6. Existing point, maintenance, reporting, API/Admin lint, and production builds run as regressions.

The feature must not depend only on mocks: CI must execute at least one real PostGIS query against a migrated database.

## CI Design

Add a dedicated PostGIS workflow triggered by:

- `apps/api/prisma/**`;
- the new spatial service/spec;
- points controller/module changes;
- its own workflow;
- `docs/V1_TODO.md`.

The workflow uses `postgis/postgis:16-3.4`, waits for readiness, generates Prisma Client, deploys migrations, runs the real integration test, then runs API lint and build.

Existing Operations CI is extended to include the new point spatial unit/contract tests and relevant Prisma paths. Reporting CI remains unchanged except for its existing TODO path trigger.

Exact feature SHA and exact merge SHA must reach `completed/success` for every triggered required workflow before their respective gates are considered green.

## Production Deployment

Production remains untouched until PR merge and post-merge exact-SHA CI success.

Pre-deploy read-only checks:

- PostgreSQL server version;
- PostGIS extension availability and installed version;
- migration history;
- invalid/half-populated coordinate count;
- target source-file comparison against the merge base to protect production-only hotfixes;
- API/Admin/SAP service health.

Deployment sequence:

1. Create a rollback backup containing target source files, API `dist`, Admin `.next`, migration metadata, and a database schema-only dump covering the affected objects.
2. Selectively deploy only merged target source, migration, workflow/document files as applicable.
3. Install dependencies only if lockfiles changed; none are planned.
4. Generate Prisma Client.
5. Run API/Admin lint and production builds before any restart.
6. Apply `prisma migrate deploy`.
7. Verify extension, generated column, constraints, GiST index, coordinate projection count, and a read-only `EXPLAIN`/query smoke.
8. Restart only the required application services.
9. Verify service state, public health, admin HTTP 200, unauthenticated nearby endpoint HTTP 401, and authenticated read-only nearby contract.
10. Check journals and SAP timer/service health without modifying SAP automation.
11. Verify deployed source hashes against merged `main`.

If migration or verification fails, do not restart. Because the new spatial column is generated from existing decimals and contains no independent business data, the emergency database rollback procedure may drop the GiST index, generated column, and added constraints after recording the applied migration state and failure evidence. It must not drop the PostGIS extension because another database object may use it. Prisma migration history is reconciled only through an explicit, recorded recovery step; it is never edited ad hoc.

## Scope Boundaries

Included:

- PostGIS extension migration;
- generated geography projection and GiST index;
- assigned-nearby backend endpoint;
- unit, controller, migration, and real PostGIS integration tests;
- CI coverage;
- TODO completion after all local and feature-CI gates pass.

Excluded:

- mobile changes;
- dedicated `YAKINIMDAKİLER` screen;
- in-app map;
- road routing, ETA, or route optimization;
- favorites, offline cache, and synchronization;
- changing existing coordinate-learning algorithms;
- converting visit/history coordinate columns to geography;
- modifying SAP automation.

## Acceptance Criteria

- Existing decimal coordinate writers continue unchanged.
- Migrated valid coordinates always produce an equivalent SRID 4326 geography point.
- The GiST index exists and `ST_DWithin` is used by the application query.
- A technician can retrieve only their own effective active assigned points within the radius, nearest first.
- Boundary validation and empty/unlocated behavior are deterministic.
- A real PostGIS integration test passes in CI.
- No mobile files or SAP automation files change.
- All mandated RED, GREEN, regression, exact-SHA CI, merge, post-merge CI, selective deploy, build-before-restart, production smoke, journal, hash, and backup gates are satisfied.
