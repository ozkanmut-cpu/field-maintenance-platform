import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./maintenance-calendar.tsx', import.meta.url), 'utf8');

test('maintenance calendar keeps real due and obligation history contracts in an operational queue', () => {
  assert.match(source, /\/api\/backend\/maintenance\/due/);
  assert.match(source, /\/api\/backend\/maintenance\/obligations\/point\//);
  assert.match(source, /Geciken/);
  assert.match(source, /Bu dönem/);
  assert.match(source, /Atanmamış/);
  assert.match(source, /Yükümlülük Geçmişi/);
});

test('maintenance calendar supports status, technician and maintenance-type filters without mutations', () => {
  assert.match(source, /aria-label="Bakım durumu filtresi"/);
  assert.match(source, /aria-label="Teknisyen filtresi"/);
  assert.match(source, /aria-label="Bakım tipi filtresi"/);
  assert.match(source, /maintenanceTypeFilter/);
  assert.match(source, /technicianFilter/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
});
