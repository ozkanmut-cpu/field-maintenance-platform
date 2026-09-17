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
