import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('exact-SHA workflow invokes both dashboard and navigation/point browser contracts', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/main-sha-gate.yml', import.meta.url), 'utf8');
  const command = workflow.split('\n').find(line => /run:.*playwright test/.test(line))?.split('run:')[1].trim();
  assert.ok(command, 'browser execution command is configured');
  const scratch = mkdtempSync(join(tmpdir(), 'fmp-ci-contract-'));
  try {
    writeFileSync(join(scratch, 'npx'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.FMP_ARGV, JSON.stringify(process.argv.slice(2)));', { mode: 0o755 });
    const result = spawnSync('sh', ['-c', command], { env: { ...process.env, PATH: scratch + ':' + process.env.PATH, FMP_ARGV: join(scratch, 'argv.json') }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const args = JSON.parse(readFileSync(join(scratch, 'argv.json'), 'utf8'));
    assert.ok(args.includes('e2e/ai-dashboard.spec.ts'));
    assert.ok(args.includes('e2e/navigation-point-redesign.spec.ts'), 'navigation/point browser contracts must execute in the exact-SHA gate');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
