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
  assert.match(source, /Açık yükümlülük/,
    'Maintenance tab must make the real obligation totals readable without exposing raw objects');
  assert.match(source, /Dönem/,
    'Maintenance tab must show the real obligation cycle');
  assert.match(source, /Vade aralığı/,
    'Maintenance tab must show the real obligation due window');
  assert.match(source, /Gerçekleşen ziyaretler/,
    'Maintenance tab must expose the visits linked to each obligation');
  assert.doesNotMatch(source, /completedAt \?\? item\.resolvedAt/,
    'A missed obligation resolution must not be presented as a completed maintenance');
  assert.match(source, /assignments\/point\/\$\{pointId\}/,
    'Assignments tab must use real point assignments');
  assert.match(source, /Görevlendirme türü/,
    'Assignments tab must give the real assignment kind a readable label');
  assert.match(source, /Başlangıç/,
    'Assignments tab must show the real assignment start time');
  assert.match(source, /Aktiflik/,
    'Assignments tab must expose whether the assignment remains active');
  assert.match(source, /audit\?entityId=/,
    'Audit tab must use the real audit endpoint filtered by point id');
  assert.match(source, /maintenance\/point\/\$\{pointId\}\/paperwork-history/,
    'Paperwork tab must use the real point-scoped paperwork history endpoint');
  assert.doesNotMatch(source, /Bu ayrıntılar mevcut Evrak Yönetimi ekranında korunur/,
    'Paperwork must be inspectable from the point detail rather than a placeholder');
  assert.match(source, /Evrak durumu/,
    'Paperwork must have a dedicated, readable operations table rather than raw object JSON');
  assert.match(source, /Servis fişi/);
  assert.match(source, /Teyit/);
  assert.match(source, /Değişiklik geçmişi/);
  assert.match(source, /formatDateTime/,
    'Paperwork dates must be rendered as readable timestamps');
  assert.match(source, /paperworkChanges/,
    'Each visit must expose the real per-visit paperwork changes, not only a count');
  assert.match(source, /previousStatus/,
    'Paperwork history must use the real Prisma previousStatus field');
  assert.match(source, /newStatus/);
});
