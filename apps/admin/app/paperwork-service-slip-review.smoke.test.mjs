import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bulkPaperworkStatusOptions, paperworkStatusOptions } from './paperwork-status-policy.mjs';

const source = readFileSync(new URL('./paperwork-management.tsx', import.meta.url), 'utf8');
const reportingWorkflow = readFileSync(new URL('../../../.github/workflows/reporting-ci.yml', import.meta.url), 'utf8');

test('admin offers only MISSING and APPROVED as final decisions for a pending-review service slip', () => {
  assert.deepEqual(paperworkStatusOptions('SERVICE_SLIP', 'PENDING_REVIEW'), [
    { value: 'PENDING_REVIEW', label: 'İnceleme bekliyor', disabled: true },
    { value: 'MISSING', label: 'Eksik', disabled: false },
    { value: 'APPROVED', label: 'Onaylandı', disabled: false },
  ]);
});

test('confirmation choices expose APPROVED but never the service-slip-only review state', () => {
  assert.deepEqual(paperworkStatusOptions('CONFIRMATION', 'PENDING'), [
    { value: 'PENDING', label: 'Bekliyor', disabled: false },
    { value: 'PRESENT', label: 'Var', disabled: false },
    { value: 'MISSING', label: 'Eksik', disabled: false },
    { value: 'APPROVED', label: 'Onaylandı', disabled: false },
  ]);
});

test('bulk service-slip review offers no transition that the API will reject', () => {
  assert.deepEqual(bulkPaperworkStatusOptions('SERVICE_SLIP', ['PRESENT', 'PENDING_REVIEW']), [
    { value: 'MISSING', label: 'Eksik', disabled: false },
    { value: 'APPROVED', label: 'Onaylandı', disabled: false },
  ]);
});

test('admin paperwork card treats pending review as unresolved and exposes its own count', () => {
  assert.match(source, /serviceSlipStatus === 'PENDING_REVIEW'/);
  assert.match(source, /const pendingSlip = visits\.filter\(\(v\) => v\.serviceSlipStatus === 'PENDING' \|\| v\.serviceSlipStatus === 'PENDING_REVIEW'\)\.length/);
  assert.match(source, /İnceleme: \{pendingReviewSlip\}/);
});

test('reporting CI executes the service-slip API and admin review regressions', () => {
  assert.match(reportingWorkflow, /src\/maintenance\/service-slip-review\.spec\.ts/);
  assert.match(reportingWorkflow, /apps\/admin\/app\/paperwork-service-slip-review\.smoke\.test\.mjs/);
});
