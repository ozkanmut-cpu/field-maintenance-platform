import assert from 'node:assert/strict';

const SHA_256 = /^[a-f0-9]{64}$/;

export function assertMobileReleaseManifest(manifest, installedApk) {
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.source.sha, /^[a-f0-9]{40}$/);
  assert.match(manifest.apk.sha256, SHA_256);
  assert.match(manifest.apk.certificateSha256, SHA_256);
  assert.match(manifest.packageName, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  assert.equal(typeof manifest.versionCode, 'number');
  assert.ok(Number.isInteger(manifest.versionCode) && manifest.versionCode > 0);
  assert.match(manifest.versionName, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);

  assert.equal(manifest.apk.sha256, installedApk.sha256);
  assert.equal(manifest.packageName, installedApk.packageName);
  assert.equal(manifest.versionCode, installedApk.versionCode);
  assert.equal(manifest.versionName, installedApk.versionName);
  assert.equal(manifest.apk.certificateSha256, installedApk.certificateSha256);
}
