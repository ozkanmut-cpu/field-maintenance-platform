import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(mobileDir, '../..');

function generatedManifest(evidenceMode) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'fmp-cleartext-'));
  const fixtureMobile = path.join(fixture, 'mobile');
  fs.cpSync(mobileDir, fixtureMobile, {
    recursive: true,
    filter(source) {
      const name = path.basename(source);
      return !['node_modules', '.expo', 'android', 'ios'].includes(name);
    },
  });
  fs.symlinkSync(path.join(repoRoot, 'node_modules'), path.join(fixture, 'node_modules'));
  try {
    execFileSync('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
      cwd: fixtureMobile,
      env: { ...process.env, EXPO_PUBLIC_MOCKUP_EVIDENCE_MODE: evidenceMode },
      stdio: 'pipe',
    });
    return fs.readFileSync(path.join(fixtureMobile, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

test('generated Android manifest allows cleartext only in mockup evidence mode', () => {
  assert.match(generatedManifest('1'), /android:usesCleartextTraffic="true"/);
  assert.doesNotMatch(generatedManifest('0'), /android:usesCleartextTraffic/);
});
