import assert from 'node:assert/strict';
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

test('renders the credential-free entry only for an explicit evidence build flag', () => {
  assert.match(mode, /EXPO_PUBLIC_MOCKUP_EVIDENCE_MODE === '1'/);
  assert.match(app, /p\.mockupEvidenceMode && <SecondaryButton title="MOCKUP TEST OTURUMU"/);
  assert.match(api, /startMockupEvidenceSession/);
  assert.match(workflow, /EXPO_PUBLIC_MOCKUP_EVIDENCE_MODE: \$\{\{ startsWith\(github\.head_ref \|\| github\.ref_name, 'codex\/test-apk-'\) && '1' \|\| '0' \}\}/);
});
