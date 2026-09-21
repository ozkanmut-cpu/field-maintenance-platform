import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/android-apk.yml'), 'utf8');

test('isolated test-APK branches use only the local emulator mock API', () => {
  assert.match(workflow, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+api_base_url:/);
  assert.match(workflow, /startsWith\(github\.head_ref, 'codex\/test-apk-'\)/);
  assert.match(workflow, /http:\/\/10\.0\.2\.2:3100\/api/);
  assert.match(workflow, /inputs\.api_base_url/);
  assert.match(workflow, /https:\/\/api\.field-maintenance-prod\.com\/api/);
});
