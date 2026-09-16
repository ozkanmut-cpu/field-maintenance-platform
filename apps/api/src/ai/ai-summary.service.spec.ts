import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AiSummaryService } from './ai-summary.service';

const service = new AiSummaryService();
const lowRisk: any = { technicianId: 't1', engineVersion: 'x', state: 'READY', severity: 'LOW', confidence: 'MEDIUM', signals: [], reasons: [] };
const highRisk: any = { technicianId: 't1', engineVersion: 'x', state: 'READY', severity: 'HIGH', confidence: 'HIGH', signals: [{ code: 'OVERLOAD', severity: 'HIGH', evidence: {} }], reasons: ['OVERLOAD'] };

test('technician daily summary surfaces carryover and operational attention', () => {
  const result = service.technicianDaily({ technicianId: 't1', name: 'Ali', currentWork: 8, carryover: 2, risk: highRisk, suspiciousVisits: 1, paperworkPending: 2 });
  assert.equal(result.scope, 'TECHNICIAN_DAILY');
  assert.equal(result.headlineCode, 'TECHNICIAN_DAY_HIGH_ATTENTION');
  assert.ok(result.reasonCodes.includes('CARRYOVER_PRESENT'));
  assert.ok(result.reasonCodes.includes('PAPERWORK_BACKLOG_PRESENT'));
});
test('admin summary combines technician risk, region health and recommendations', () => {
  const planning: any = { engineVersion: 'x', state: 'READY', reasons: [], recommendations: [{ id: 'r1' }] };
  const regions: any[] = [{ regionId: 'r1', engineVersion: 'x', score: 40, state: 'RED', confidence: 'MEDIUM', trend: 'WORSENING', reasonCodes: ['X'], evidence: {} }];
  const result = service.adminDaily([
    { technicianId: 't1', name: 'Ali', currentWork: 8, carryover: 1, risk: highRisk, suspiciousVisits: 0, paperworkPending: 0 },
  ], regions, planning);
  assert.equal(result.scope, 'ADMIN_DAILY');
  assert.equal(result.headlineCode, 'ADMIN_DAY_HIGH_ATTENTION');
  assert.equal(result.metrics.redRegionCount, 1);
});

test('period summary remains healthy when no carryover or elevated region/risk exists', () => {
  const result = service.period('2026-W37', [
    { technicianId: 't1', name: 'Ali', currentWork: 4, carryover: 0, risk: lowRisk, suspiciousVisits: 0, paperworkPending: 0 },
  ], [{ regionId: 'r1', engineVersion: 'x', score: 90, state: 'GREEN', confidence: 'HIGH', trend: 'STABLE', reasonCodes: [], evidence: {} }] as any);
  assert.equal(result.headlineCode, 'PERIOD_HEALTHY');
  assert.deepEqual(result.reasonCodes, []);
});
