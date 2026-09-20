const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  buildDbArgs,
  buildImportEvidence,
  parseSyncArgs,
} = require('./sap_import_metadata');

test('verified search range is captured from acquisition time across Istanbul midnight', () => {
  assert.deepEqual(buildImportEvidence(new Date('2026-09-20T20:59:30.000Z')), {
    acquiredAt: '2026-09-20T20:59:30.000Z',
    windowStart: '2026-09-06',
    windowEnd: '2026-09-20',
  });
  assert.deepEqual(buildImportEvidence(new Date('2026-09-20T21:00:30.000Z')), {
    acquiredAt: '2026-09-20T21:00:30.000Z',
    windowStart: '2026-09-07',
    windowEnd: '2026-09-21',
  });
});

test('dry-run and real sync receive the same verified export evidence metadata', () => {
  const evidence = buildImportEvidence(new Date('2026-09-20T20:59:30.000Z'));
  const expectedTail = [
    '--acquired-at', evidence.acquiredAt,
    '--window-start', evidence.windowStart,
    '--window-end', evidence.windowEnd,
    '/tmp/export.csv',
  ];
  assert.deepEqual(buildDbArgs('/tmp/export.csv', true, evidence), ['--dry-run', ...expectedTail]);
  assert.deepEqual(buildDbArgs('/tmp/export.csv', false, evidence), expectedTail);
});

test('replayed sync preserves original export acquisition and range instead of using replay time', () => {
  const parsed = parseSyncArgs([
    '--acquired-at', '2026-09-20T20:59:30.000Z',
    '--window-start', '2026-09-06',
    '--window-end', '2026-09-20',
    '/tmp/export.csv',
  ]);

  assert.equal(parsed.acquiredAt.toISOString(), '2026-09-20T20:59:30.000Z');
  assert.equal(parsed.windowStart.toISOString(), '2026-09-06T00:00:00.000Z');
  assert.equal(parsed.windowEnd.toISOString(), '2026-09-20T00:00:00.000Z');
  assert.equal(parsed.file, '/tmp/export.csv');
  assert.equal(parsed.dryRun, false);
});

test('sync rejects missing or malformed verified export evidence', () => {
  assert.throws(() => parseSyncArgs(['/tmp/export.csv']), /acquisition time is required/);
  assert.throws(() => parseSyncArgs([
    '--acquired-at', 'not-a-date',
    '--window-start', '2026-09-06',
    '--window-end', '2026-09-20',
    '/tmp/export.csv',
  ]), /acquisition time is invalid/);
  assert.throws(() => parseSyncArgs([
    '--acquired-at', '2026-09-20T21:00:30.000Z',
    '--window-start', '2026-09-06',
    '--window-end', '2026-09-20',
    '/tmp/export.csv',
  ]), /window does not match acquisition time/);
});
