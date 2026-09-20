import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

test('partial-maintenance migration enforces non-negative, internally consistent visit counts', () => {
  const migrationPath = path.resolve(__dirname, '../../prisma/migrations/20260920113100_partial_maintenance_count_constraints/migration.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /ADD CONSTRAINT "maintenance_visits_partial_maintenance_counts_check"/);
  assert.match(migration, /"total_cooler_count" >= 0/);
  assert.match(migration, /"maintained_cooler_count" >= 0/);
  assert.match(migration, /"missing_maintenance_count" = "total_cooler_count" - "maintained_cooler_count"/);
});

test('the integrated migration chain introduces maintained_cooler_count exactly once', () => {
  const migrationsRoot = path.resolve(__dirname, '../../prisma/migrations');
  const additions = fs.readdirSync(migrationsRoot)
    .map((directory) => path.join(migrationsRoot, directory, 'migration.sql'))
    .filter((file) => fs.existsSync(file))
    .flatMap((file) => fs.readFileSync(file, 'utf8').match(/ADD COLUMN "maintained_cooler_count"/g) ?? []);

  assert.equal(additions.length, 1);
});
