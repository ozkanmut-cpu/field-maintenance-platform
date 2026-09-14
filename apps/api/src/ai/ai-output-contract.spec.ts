import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const files = [
  'data-maturity.types.ts',
  'data-quality-engine.types.ts',
  'equipment-profile.types.ts',
  'location-intelligence.types.ts',
  'weekly-workload.types.ts',
  'point-difficulty.types.ts',
  'risk-engine.types.ts',
  'planning-engine.types.ts',
  'similar-week.service.ts',
  'workload-calibration.service.ts',
  'backtest.service.ts',
  'region-health.service.ts',
  'trend.service.ts',
  'ai-summary.service.ts',
];

const source = (name: string) => readFileSync(join(__dirname, name), 'utf8');
test('user-visible AI output contracts expose maturity, confidence and explainability', () => {
  for (const file of files) {
    const text = source(file);
    assert.match(text, /confidence/, `${file} must expose confidence`);
    assert.match(text, /maturityState|overallState/, `${file} must expose maturity state`);
    assert.match(text, /reasonCodes/, `${file} must expose reason codes`);
  }
});

test('what-if scenarios expose the same governance metadata without applying changes', () => {
  const text = source('what-if.service.ts');
  assert.match(text, /maturityState/);
  assert.match(text, /confidence/);
  assert.match(text, /reasonCodes/);
  assert.match(text, /SIMULATION_ONLY/);
  assert.match(text, /NO_AUTOMATIC_ASSIGNMENT_CHANGE|NO_AUTOMATIC_REGION_ASSIGNMENT_CHANGE/);
});
