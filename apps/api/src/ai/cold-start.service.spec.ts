import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ColdStartService } from './cold-start.service';
import { FeatureRecord, FeatureSnapshot } from './feature-store.types';

const service = new ColdStartService();

function snapshot(weekKey: string, records: FeatureRecord[]): FeatureSnapshot {
  const [year, week] = weekKey.replace('W', '').split('-').map(Number);
  return {
    weekKey, isoYear: year, isoWeek: week,
    weekStart: '2026-01-05', weekEnd: '2026-01-11',
    startInstant: '2026-01-04T21:00:00.000Z', endExclusiveInstant: '2026-01-11T21:00:00.000Z',
    sourceDataThrough: null, sourceHash: weekKey, generatedAt: '2026-01-11T21:00:00.000Z', records,
  };
}

function point(id: string, regionId: string, maintenanceType: string, arg4: number, arg5?: number): FeatureRecord {
  const maintenanceWeek = arg5 === undefined ? null : arg4;
  const visitCount = arg5 === undefined ? arg4 : arg5;
  return { entityType: 'POINT', entityId: id, features: { regionId, maintenanceType, maintenanceWeek, visitCount } };
}

test('prefers entity history once enough own samples exist', () => {
  const history = [
    snapshot('2026-W01', [point('p1', 'r1', 'STANDARD', 2)]),
    snapshot('2026-W02', [point('p1', 'r1', 'STANDARD', 4)]),
    snapshot('2026-W03', [point('p1', 'r1', 'STANDARD', 6)]),
  ];
  const result = service.estimatePoint(history, 'p1', 'visitCount');
  assert.equal(result.source, 'ENTITY_HISTORY');
  assert.equal(result.value, 4);
  assert.equal(result.confidence, 'MEDIUM');
});

test('new point falls back to same region and maintenance type cohort', () => {
  const history = [1, 2].map((week) => snapshot(`2026-W0${week}`, [
    point('new', 'r1', 'STANDARD', 0),
    point('p2', 'r1', 'STANDARD', 2 + week),
    point('p3', 'r1', 'STANDARD', 4 + week),
    point('p4', 'r2', 'STANDARD', 20),
  ]));
  const result = service.estimatePoint(history, 'new', 'visitCount');
  assert.equal(result.source, 'REGION_TYPE_COHORT');
  assert.equal(result.entityCount, 2);
  assert.equal(result.confidence, 'MEDIUM');
});

test('falls back to company cohort when local cohorts are insufficient', () => {
  const history = [1, 2].map((week) => snapshot(`2026-W0${week}`, [
    point('new', 'r9', 'SMARTCLEAN', 0),
    point('p1', 'r1', 'STANDARD', 2),
    point('p2', 'r2', 'STANDARD', 4),
    point('p3', 'r3', 'STANDARD', 6),
  ]));
  const result = service.estimatePoint(history, 'new', 'visitCount');
  assert.equal(result.source, 'COMPANY_COHORT');
  assert.equal(result.value, 4);
  assert.equal(result.confidence, 'LOW');
});

test('returns insufficient rather than inventing a baseline', () => {
  const history = [snapshot('2026-W01', [
    { entityType: 'TECHNICIAN', entityId: 'new-tech', features: { assignedRegionCount: 1, completedVisitCount: 0 } },
  ])];
  const result = service.estimateTechnician(history, 'new-tech', 'completedVisitCount');
  assert.equal(result.source, 'INSUFFICIENT');
  assert.equal(result.value, null);
  assert.equal(result.confidence, 'UNKNOWN');
});

test('SmartClean prefers same region, type and rut-week cohort', () => {
  const history = [
    snapshot('2026-W35', [
      point('target', 'r1', 'SMARTCLEAN', 1, 0),
      point('same1', 'r1', 'SMARTCLEAN', 1, 10),
      point('same2', 'r1', 'SMARTCLEAN', 1, 12),
      point('other1', 'r1', 'SMARTCLEAN', 2, 100),
      point('other2', 'r1', 'SMARTCLEAN', 2, 120),
    ]),
    snapshot('2026-W36', [
      point('target', 'r1', 'SMARTCLEAN', 1, 0),
      point('same1', 'r1', 'SMARTCLEAN', 1, 14),
      point('same2', 'r1', 'SMARTCLEAN', 1, 16),
      point('other1', 'r1', 'SMARTCLEAN', 2, 140),
      point('other2', 'r1', 'SMARTCLEAN', 2, 160),
    ]),
  ];
  const result = service.estimatePoint(history, 'target', 'visitCount');
  assert.equal(result.source, 'REGION_TYPE_WEEK_COHORT');
  assert.equal(result.value, 13);
});
