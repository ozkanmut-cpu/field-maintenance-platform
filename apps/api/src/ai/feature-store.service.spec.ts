import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FeatureStoreService } from './feature-store.service';
import { GeographyService } from './geography.service';
import { GeographyClusteringService } from './geography-clustering.service';

function service() {
  const prisma: any = {
    user: { findMany: async () => [] },
    region: { findMany: async () => [] },
    point: { findMany: async () => [] },
    maintenanceVisit: { findMany: async () => [] },
    maintenanceAttempt: { findMany: async () => [] },
    maintenanceObligation: { findMany: async () => [] },
  };
  const geography = new GeographyService(prisma);
  const clustering = new GeographyClusteringService(geography);
  const assigned: any = { forWeek: async () => ({ weekKey: 'x', technicians: [], unassigned: { standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0 } }) };
  const effective: any = { smartcleanScheduleConfigured: () => true, smartcleanForWeek: async () => [] };
  return new FeatureStoreService(prisma, assigned, effective, geography, clustering);
}
test('weekly feature snapshot is reproducible for identical source evidence', async () => {
  const sut = service();
  const asOf = new Date('2026-09-09T12:00:00Z');
  const first = await sut.buildWeeklySnapshot(asOf);
  const second = await sut.buildWeeklySnapshot(asOf);
  assert.equal(first.weekKey, second.weekKey);
  assert.equal(first.sourceHash, second.sourceHash);
  assert.deepEqual(first.records, second.records);
  assert.equal(first.engineVersion, second.engineVersion);
  assert.equal(first.featureSchemaVersion, second.featureSchemaVersion);
});
