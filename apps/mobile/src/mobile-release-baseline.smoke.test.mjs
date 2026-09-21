import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertMobileReleaseManifest } from './mobile-release-baseline.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../../../ops/release/mobile-apk-manifest.json', import.meta.url)),
);

test('released mobile baseline manifest matches the published APK evidence', () => {
  assertMobileReleaseManifest(manifest, {
    sha256: 'c8b0439190e350968b7dedd22c4f013b111c5900dfd501865a1c7f14c2d8ef03',
    packageName: 'com.fmp.mobile',
    versionCode: 1,
    versionName: '0.1.0',
    certificateSha256: 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c',
  });
});

test('released mobile baseline references an existing source commit', () => {
  execFileSync('git', ['cat-file', '-e', manifest.source.sha], {
    cwd: new URL('../../..', import.meta.url),
    stdio: 'pipe',
  });
});
