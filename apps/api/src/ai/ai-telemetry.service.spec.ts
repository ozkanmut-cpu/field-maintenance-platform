import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AiTelemetryService } from './ai-telemetry.service';

test('records duration and success count for AI operations', async () => {
  const telemetry = new AiTelemetryService();
  const value = await telemetry.measure('dashboard', async () => 42);
  assert.equal(value, 42);
  const metric = telemetry.snapshot().operations.find((item) => item.operation === 'dashboard');
  assert.equal(metric?.count, 1);
  assert.equal(metric?.errorCount, 0);
  assert.ok((metric?.lastDurationMs ?? -1) >= 0);
});

test('records errors and rethrows the original failure', async () => {
  const telemetry = new AiTelemetryService();
  await assert.rejects(() => telemetry.measure('what-if', async () => { throw new Error('boom'); }), /boom/);
  const metric = telemetry.snapshot().operations.find((item) => item.operation === 'what-if');
  assert.equal(metric?.count, 1);
  assert.equal(metric?.errorCount, 1);
  assert.equal(metric?.errorRate, 1);
});
