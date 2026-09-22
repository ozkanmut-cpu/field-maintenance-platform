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

test('legacy bulk transition policy remains API-safe even though the redesigned page has no bulk UI', () => {
  assert.deepEqual(bulkPaperworkStatusOptions('SERVICE_SLIP', ['PRESENT', 'PENDING_REVIEW']), [
    { value: 'MISSING', label: 'Eksik', disabled: false },
    { value: 'APPROVED', label: 'Onaylandı', disabled: false },
  ]);
  assert.doesNotMatch(source, /paperwork\/bulk/);
});

test('paperwork center treats pending review and missing paperwork as unresolved', () => {
  assert.match(source, /function isUnresolved\(status\?: PaperworkStatus\)[\s\S]{0,100}status !== 'APPROVED'/);
  assert.match(source, /const pendingCount = visible\.filter/);
  assert.match(source, /const missingSlipCount = visible\.filter\(\(visit\) => visit\.serviceSlipStatus === 'MISSING'\)\.length/);
});

test('reporting CI executes the service-slip API and admin review regressions', () => {
  assert.match(reportingWorkflow, /src\/maintenance\/service-slip-review\.spec\.ts/);
  assert.match(reportingWorkflow, /apps\/admin\/app\/paperwork-service-slip-review\.smoke\.test\.mjs/);
});
