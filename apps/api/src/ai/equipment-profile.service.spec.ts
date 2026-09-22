import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EquipmentProfileService } from './equipment-profile.service';
import { FeatureSnapshot, FeatureValue } from './feature-store.types';

const service = new EquipmentProfileService();
function snap(week: number, features: Record<string, FeatureValue>): FeatureSnapshot {
  return { weekKey: `2026-W${String(week).padStart(2,'0')}`, isoYear: 2026, isoWeek: week, weekStart: `2026-01-${String(week).padStart(2,'0')}`, weekEnd: '2026-01-31', startInstant: '2026-01-01T00:00:00Z', endExclusiveInstant: '2026-02-01T00:00:00Z', sourceDataThrough: null, sourceHash: String(week), generatedAt: '2026-01-01T00:00:00Z', records: [{ entityType: 'POINT', entityId: 'p1', features }] };
}
const vector = (c:number,t:number,p:number,s:number) => ({ equipmentSnapshotCoolerCount:c, equipmentSnapshotTowerCount:t, equipmentSnapshotTapCount:p, equipmentSnapshotSmarttapCount:s, equipmentConfirmedVisitCount:1 });

test('builds high confidence for complete recently verified stable profiles', () => {
  const history = [1,2,3].map((week) => snap(week, { equipmentProfileComplete:true, equipmentVerificationAgeDays:10, equipmentVerifiedAt:'2026-01-20T00:00:00Z', ...vector(2,1,4,0) }));
  const result = service.assessPoint(history, 'p1');
  assert.equal(result.confidence, 'HIGH');
  assert.equal(result.stability, 'STABLE');
  assert.equal(result.changeCount, 0);
});

test('detects oscillating equipment snapshots and lowers stability', () => {
  const history = [snap(1,{equipmentProfileComplete:true,equipmentVerificationAgeDays:5,...vector(2,1,4,0)}), snap(2,{equipmentProfileComplete:true,equipmentVerificationAgeDays:5,...vector(5,1,4,0)}), snap(3,{equipmentProfileComplete:true,equipmentVerificationAgeDays:5,...vector(2,1,4,0)})];
  const result = service.assessPoint(history, 'p1');
  assert.equal(result.stability, 'VOLATILE');
  assert.ok(result.anomalyCodes.includes('EQUIPMENT_PROFILE_OSCILLATION'));
});

test('incomplete profile never receives false confidence', () => {
  const result = service.assessPoint([snap(1,{equipmentProfileComplete:false,equipmentVerificationAgeDays:null,equipmentConfirmedVisitCount:0})], 'p1');
  assert.equal(result.confidence, 'UNKNOWN');
  assert.equal(result.confidenceScore, 0);
  assert.ok(result.reasons.includes('EQUIPMENT_PROFILE_INCOMPLETE'));
});
