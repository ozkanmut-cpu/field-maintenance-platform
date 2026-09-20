import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./point-timeline.tsx', import.meta.url), 'utf8');
const reportingWorkflow = fs.readFileSync(new URL('../../../.github/workflows/reporting-ci.yml', import.meta.url), 'utf8');

test('point timeline types and maintenance summary expose partial-maintenance evidence', () => {
  assert.match(source, /type TimelineData =/);
  assert.match(source, /totalCoolerCount\?: number \| null/);
  assert.match(source, /maintainedCoolerCount\?: number \| null/);
  assert.match(source, /missingMaintenanceCount\?: number \| null/);
  assert.match(source, /missingMaintenanceExplanation\?: string \| null/);
  assert.match(source, /d\.maintainedCoolerCount/);
  assert.match(source, /d\.totalCoolerCount/);
  assert.match(source, /d\.missingMaintenanceCount/);
  assert.match(source, /d\.missingMaintenanceExplanation/);
});

test('reporting CI executes the partial-maintenance API and timeline regressions', () => {
  assert.match(reportingWorkflow, /src\/maintenance\/partial-maintenance\.spec\.ts/);
  assert.match(reportingWorkflow, /apps\/admin\/app\/point-timeline\.partial-maintenance\.smoke\.test\.mjs/);
});
