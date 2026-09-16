import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { evaluateAiOutputPolicy } from './ai-output-policy';

const maturity:any = { capability:'RISK', state:'ACTIVE', score:80, qualityScore:80, reasons:[] };

test('blocks AI output when maturity is not ready', () => {
  const policy = evaluateAiOutputPolicy({ ...maturity, state:'WARMING_UP' }, undefined);
  assert.equal(policy.allowed, false);
  assert.ok(policy.reasonCodes.includes('AI_MATURITY_GATE_NOT_READY'));
});

test('blocks AI output when shared data quality is below safe threshold', () => {
  const policy = evaluateAiOutputPolicy(maturity, { score:40, confidence:'MEDIUM', maturityState:'WARMING_UP', issues:[], reasonCodes:[] });
  assert.equal(policy.allowed, false);
  assert.equal(policy.dataQualityState, 'BLOCKED');
});

test('caps confidence when data quality is usable but limited', () => {
  const policy = evaluateAiOutputPolicy(maturity, { score:65, confidence:'MEDIUM', maturityState:'ACTIVE', issues:[], reasonCodes:[] });
  assert.equal(policy.allowed, true);
  assert.equal(policy.confidenceCap, 'LOW');
  assert.equal(policy.dataQualityState, 'LIMITED');
});
