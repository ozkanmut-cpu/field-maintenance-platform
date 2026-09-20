import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github/workflows/main-sha-gate.yml');
const workflow = yaml.load(fs.readFileSync(workflowPath, 'utf8'));
const readWorkflow = (filename) => yaml.load(
  fs.readFileSync(path.join(repoRoot, '.github/workflows', filename), 'utf8'),
);
const triggers = workflow.on ?? workflow.true;

assert.deepEqual(
  triggers.push.branches,
  ['main'],
  'the exact-SHA gate must run for every push to main',
);
assert.equal(
  Object.hasOwn(triggers.push, 'paths'),
  false,
  'the exact-SHA gate must not be path-filtered',
);
assert.deepEqual(
  triggers.pull_request?.branches,
  ['main'],
  'the gate must validate pull requests that target main',
);
assert.ok(workflow.jobs['main-exact-sha-ci'], 'the exact-SHA gate job is required');

const browserContracts = workflow.jobs['browser-contracts'];
assert.ok(browserContracts, 'the browser contract gate job is required');
assert.equal(browserContracts['timeout-minutes'], 10, 'browser contract gate must be bounded to ten minutes');

const browserSteps = browserContracts.steps ?? [];
const stepByName = (name) => browserSteps.find((step) => step.name === name);
const installBrowsers = stepByName('Install Chromium and Firefox for browser contracts');
assert.equal(
  installBrowsers?.run,
  'npx playwright install --with-deps chromium firefox',
  'browser contract gate must install only Chromium and Firefox with their Linux dependencies',
);
assert.equal(
  stepByName('Admin dashboard Chromium browser contract')?.run,
  'timeout 4m npx playwright test e2e/ai-dashboard.spec.ts --config=playwright.config.ts',
  'browser contract gate must run only the admin dashboard Chromium contract with a bounded timeout',
);
assert.equal(
  stepByName('SAP Export 2 Firefox DOM contract')?.run,
  'timeout 2m node --test runtime/sap/export2_dom_contract.spec.js',
  'browser contract gate must run only the SAP Firefox DOM contract with a bounded timeout',
);

for (const [filename, jobName, forbiddenStep] of [
  ['ai-ci.yml', 'ai-validation', 'Admin browser E2E'],
  ['sap-runtime-ci.yml', 'receipt-contract', 'Export 2 real SAP DOM control contract'],
]) {
  const steps = readWorkflow(filename).jobs[jobName].steps ?? [];
  assert.equal(
    steps.some((step) => step.name === forbiddenStep),
    false,
    `${filename} must leave the browser contract to the exact-SHA gate`,
  );
}

console.log('main exact-SHA gate configuration is valid');
