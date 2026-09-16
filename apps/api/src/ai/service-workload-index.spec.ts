import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildServiceWorkloadIndex } from './service-workload-index';
import { CalibrationImpact } from './workload-calibration.service';

const impacts: CalibrationImpact[] = [
  { code:'COOLER_RELATIVE_WORKLOAD', lowRate:0.1, highRate:0.25, relativeImpact:0.15, evidence:80, confidence:'HIGH' },
  { code:'TOWER_RELATIVE_WORKLOAD', lowRate:0.1, highRate:0.3, relativeImpact:0.2, evidence:80, confidence:'HIGH' },
  { code:'TAP_RELATIVE_WORKLOAD', lowRate:0.1, highRate:0.2, relativeImpact:0.1, evidence:80, confidence:'HIGH' },
  { code:'SMARTTAP_RELATIVE_WORKLOAD', lowRate:0.1, highRate:0.15, relativeImpact:0.05, evidence:80, confidence:'HIGH' },
];
test('builds a relative workload index from learned equipment-outcome impact only', () => {
  const reference = { coolerCount:2, towerCount:1, tapCount:4, smarttapCount:1 };
  const typical = buildServiceWorkloadIndex(reference, reference, impacts, 'HIGH');
  const heavier = buildServiceWorkloadIndex({ coolerCount:4, towerCount:2, tapCount:8, smarttapCount:2 }, reference, impacts, 'HIGH');
  assert.equal(typical.state, 'READY');
  assert.equal(typical.index, 100);
  assert.ok((heavier.index ?? 0) > 100);
  assert.equal(heavier.basis, 'LEARNED_EQUIPMENT_OUTCOME_ASSOCIATION');
  assert.equal(heavier.dimensionsUsed, 4);
});

test('does not invent an index before calibration evidence is adequate', () => {
  const weak = impacts.map((item) => ({ ...item, confidence:'LOW' as const }));
  const result = buildServiceWorkloadIndex({ coolerCount:2,towerCount:1,tapCount:4,smarttapCount:1 }, { coolerCount:2,towerCount:1,tapCount:4,smarttapCount:1 }, weak, 'LOW');
  assert.equal(result.state, 'WARMING_UP');
  assert.equal(result.index, null);
  assert.ok(result.reasonCodes.includes('SERVICE_WORKLOAD_MODEL_EVIDENCE_LOW'));
});
