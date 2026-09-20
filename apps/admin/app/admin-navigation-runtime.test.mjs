import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildAdminLocation, parseAdminLocation, pointListValues } from './admin-navigation-runtime.js';

test('point list locations round-trip all list context and omit defaults', () => {
  const values = pointListValues({ query: 'izmir', status: 'ACTIVE', region: 'r-1', maintenanceType: 'SMARTCLEAN', page: 3, scrollY: 480 });
  const location = buildAdminLocation('points', values);
  assert.equal(location, '?section=points&query=izmir&status=ACTIVE&region=r-1&maintenanceType=SMARTCLEAN&page=3&scrollY=480');
  assert.deepEqual(parseAdminLocation(location), { section: 'points', ...values });
  assert.deepEqual(pointListValues({}), {});
});

test('point detail tab navigation retains the complete point-list return context', () => {
  const context = pointListValues({ query: 'market', status: 'PASSIVE', region: 'r-2', maintenanceType: 'STANDARD', page: 2, scrollY: 240 });
  const detail = buildAdminLocation('point-detail', { pointId: 'p-7', detailTab: 'maintenance', ...context });
  assert.deepEqual(parseAdminLocation(detail), { section: 'point-detail', pointId: 'p-7', detailTab: 'maintenance', ...context });
});

test('popstate parsing restores a valid location and rejects an unknown section', () => {
  assert.deepEqual(parseAdminLocation('?section=points&query=a&page=2'), { section: 'points', query: 'a', page: '2' });
  assert.deepEqual(parseAdminLocation('?section=unknown&query=a'), { section: 'dashboard', query: 'a' });
});
