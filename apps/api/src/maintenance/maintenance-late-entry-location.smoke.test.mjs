import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const serviceFile = new URL('./maintenance.service.ts', import.meta.url);

test('late completion is recorded without any location review or learning evaluation', () => {
  const source = fs.readFileSync(serviceFile, 'utf8');

  assert.match(source, /const locationDecision = enteredLate \? \{[\s\S]*locationLearningEligible: false,[\s\S]*locationReviewRequired: false/);
  assert.match(source, /reviewRecommended: locationDecision\.locationReviewRequired/);
  assert.match(source, /this\.assertCompletionDateWithinLastWeek\(performedAt, now\)/);
});
