import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const mode = fs.readFileSync(path.join(here, 'mockup-evidence-mode.ts'), 'utf8');
const app = fs.readFileSync(path.join(here, 'CorporateApp.tsx'), 'utf8');
const api = fs.readFileSync(path.join(here, 'api.ts'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/android-apk.yml'), 'utf8');

function readAndroidConfig(evidenceMode) {
  const configPath = path.join(root, 'apps/mobile/app.config.js');
  return JSON.parse(execFileSync(process.execPath, ['-e', `
    const config = require(process.argv[1]);
    const resolved = typeof config === 'function' ? config({ config: {} }) : config;
    process.stdout.write(JSON.stringify(resolved.expo.android));
  `, configPath], {
    cwd: path.join(root, 'apps/mobile'),
    env: { ...process.env, EXPO_PUBLIC_MOCKUP_EVIDENCE_MODE: evidenceMode },
    encoding: 'utf8',
  }));
}

test('renders the credential-free entry only for an explicit evidence build flag', () => {
  assert.match(mode, /EXPO_PUBLIC_MOCKUP_EVIDENCE_MODE === '1'/);
  assert.match(app, /p\.mockupEvidenceMode && <SecondaryButton title="MOCKUP TEST OTURUMU"/);
  assert.match(api, /startMockupEvidenceSession/);
  assert.match(workflow, /EXPO_PUBLIC_MOCKUP_EVIDENCE_MODE: \$\{\{ startsWith\(github\.head_ref \|\| github\.ref_name, 'codex\/test-apk-'\) && '1' \|\| '0' \}\}/);
});

test('permits Android cleartext only in the explicit isolated evidence build', () => {
  assert.equal(readAndroidConfig('1').usesCleartextTraffic, true);
  assert.notEqual(readAndroidConfig('0').usesCleartextTraffic, true);
  assert.notEqual(readAndroidConfig(undefined).usesCleartextTraffic, true);
});
