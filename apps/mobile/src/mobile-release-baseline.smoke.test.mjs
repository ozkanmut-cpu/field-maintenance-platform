import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertMobileReleaseManifest } from './mobile-release-baseline.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../../../ops/release/mobile-apk-manifest.json', import.meta.url)),
);
const publishedApkEvidence = JSON.parse(
  readFileSync(new URL('../../../ops/release/mobile-apk-evidence.json', import.meta.url)),
);

test('released mobile baseline manifest matches immutable published APK evidence', () => {
  assert.equal(manifest.source.sha, publishedApkEvidence.source.commit);
  assertMobileReleaseManifest(manifest, publishedApkEvidence.apk);
});

test('released mobile baseline references a source commit', () => {
  execFileSync('git', ['cat-file', '-e', `${manifest.source.sha}^{commit}`], {
    cwd: new URL('../../..', import.meta.url),
    stdio: 'pipe',
  });
});
