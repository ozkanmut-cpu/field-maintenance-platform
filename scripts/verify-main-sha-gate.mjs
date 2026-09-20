import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github/workflows/main-sha-gate.yml');
const workflow = yaml.load(fs.readFileSync(workflowPath, 'utf8'));
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
assert.ok(workflow.jobs['main-exact-sha-ci'], 'the exact-SHA gate job is required');

console.log('main exact-SHA gate configuration is valid');
