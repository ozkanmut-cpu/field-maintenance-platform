import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SimilarWeekService } from './similar-week.service';
import { FeatureSnapshot } from './feature-store.types';

const service = new SimilarWeekService();
function snap(week: number, equipment: number, fragmentation: number, visits: number): FeatureSnapshot {
  return { weekKey:`2026-W${String(week).padStart(2,'0')}`, isoYear:2026, isoWeek:week, weekStart:'2026-01-01', weekEnd:'2026-01-07', startInstant:'2026-01-01T00:00:00Z', endExclusiveInstant:'2026-01-08T00:00:00Z', sourceDataThrough:null, sourceHash:String(week), generatedAt:'2026-01-08T00:00:00Z', records:[
    { entityType:'SYSTEM', entityId:'SYSTEM', features:{ visitCount:visits, attemptCount:2, smartcleanCurrentWorkloadCount:4, smartcleanCarryoverWorkloadCount:1, geographicFragmentationRatio:fragmentation, geographicLargestClusterShare:0.5 } },
    { entityType:'TECHNICIAN', entityId:'t1', features:{ servicedCoolerCount:equipment, servicedTowerCount:equipment/2, servicedTapCount:equipment, servicedSmarttapCount:1, fieldRouteDistanceMeters:10000 } },
  ] };
}

test('matches equipment mix, workload and geography instead of raw week proximity', () => {
  const target = snap(4,20,0.2,50);
  const history = [snap(1,20,0.2,51), snap(2,80,0.8,120), snap(3,5,0.7,20), target];
  const [match] = service.find(history);
  assert.equal(match.weekKey, '2026-W01');
  assert.ok(match.similarity > 90);
  assert.ok(match.dimensionsUsed >= 9);
});

test('is deterministic for unsorted history and explicit target week', () => {
  const history = [snap(3,20,0.2,50), snap(1,20,0.2,50), snap(2,25,0.3,55)];
  const a = service.find(history, '2026-W03');
  const b = service.find([...history].reverse(), '2026-W03');
  assert.deepEqual(a, b);
});
