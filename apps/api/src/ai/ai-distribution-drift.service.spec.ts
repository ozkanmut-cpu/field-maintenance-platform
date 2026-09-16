import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AiDistributionDriftService } from './ai-distribution-drift.service';

const risk = (severity: 'LOW' | 'MEDIUM' | 'HIGH') => ({
  technicianId: 't', engineVersion: 'test', featureSchemaVersion: 'test', maturityState: 'ACTIVE',
  dataQualityState: 'GOOD', state: 'READY', severity, confidence: 'HIGH', signals: [], reasons: [],
}) as any;
const rec = (type: string) => ({
  id: `r:${type}`, type, technicianId: 't', priority: 1, severity: 'MEDIUM', confidence: 'HIGH',
  titleCode: 'x', reasonCodes: ['x'], evidence: {}, constraints: [],
}) as any;
test('keeps output drift unknown until enough observations exist', () => {
  const service = new AiDistributionDriftService();
  service.observe([risk('LOW')], [rec('REVIEW_ROUTE')]);
  assert.equal(service.snapshot().state, 'UNKNOWN');
});

test('detects material risk and recommendation distribution drift', () => {
  const service = new AiDistributionDriftService();
  service.observe([risk('LOW'), risk('LOW')], [rec('REVIEW_ROUTE')]);
  service.observe([risk('LOW'), risk('LOW')], [rec('REVIEW_ROUTE')]);
  service.observe([risk('HIGH'), risk('HIGH')], [rec('PRIORITIZE_CARRYOVER')]);
  service.observe([risk('HIGH'), risk('HIGH')], [rec('PRIORITIZE_CARRYOVER')]);
  const snapshot = service.snapshot();
  assert.equal(snapshot.state, 'DRIFT');
  assert.ok(snapshot.maxAbsoluteDelta !== null && snapshot.maxAbsoluteDelta >= 0.25);
  assert.ok(snapshot.reasonCodes.includes('AI_OUTPUT_DISTRIBUTION_DRIFT_DETECTED'));
});
