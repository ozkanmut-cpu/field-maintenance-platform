import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const path = new URL('./point-detail-page.tsx', import.meta.url);
test('point detail stays read only until explicit edit mode', () => {
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /useState\(false\)/);
  assert.match(source, /Düzenle/);
  assert.match(source, /Kaydet/);
  assert.match(source, /İptal/);
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /maintenance\/point-timeline\?pointId=/,
    'Timeline tab must use the real point timeline endpoint');
  assert.match(source, /maintenance\/obligations\/point\/\$\{pointId\}\/history/,
    'Maintenance tab must use real obligation history');
  assert.match(source, /assignments\/point\/\$\{pointId\}/,
    'Assignments tab must use real point assignments');
  assert.match(source, /audit\?entityId=/,
    'Audit tab must use the real audit endpoint filtered by point id');
});
