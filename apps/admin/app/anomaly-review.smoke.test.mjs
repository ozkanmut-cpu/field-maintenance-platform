import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./anomaly-review.tsx', import.meta.url), 'utf8');

test('anomaly review presents real queue metrics and keeps location decisions separate from maintenance approval', () => {
  assert.match(source, /Konum & Anomali İnceleme/);
  assert.match(source, /Konum kararı bakım statüsünü değiştirmez/);
  assert.match(source, /Konum incelemesi/);
  assert.match(source, /Şüpheli seri giriş/);
  assert.match(source, /Teknisyen konum onayı/);
  assert.match(source, /canonicalLongitude/);
  assert.match(source, /scanAll/);
});

test('anomaly review keeps the real review and location approval API contracts', () => {
  assert.match(source, /\/api\/backend\/maintenance\/review-queue\?limit=200/);
  assert.match(source, /\/api\/backend\/maintenance\/review-history\?visitId=/);
  assert.match(source, /\/api\/backend\/maintenance\/review-resolve/);
  assert.match(source, /\/api\/backend\/maintenance\/location-review\/approve-visit/);
});
