import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const detailFile = new URL('./TaskDetailScreen.tsx', import.meta.url);
const appFile = new URL('../CorporateApp.tsx', import.meta.url);

function source(file) {
  assert.ok(fs.existsSync(file), `${file.pathname} must exist`);
  return fs.readFileSync(file, 'utf8');
}

test('task detail renders status, due range, address directions, equipment, and backend-aligned location presentation', () => {
  const detail = source(detailFile);

  assert.match(detail, /task\.priority === 'OVERDUE'/);
  assert.match(detail, /task\.dueStart/);
  assert.match(detail, /task\.dueEnd/);
  assert.match(detail, /onDirections\(task\)/);
  assert.match(detail, /isEquipmentComplete\(task\)/);
  assert.match(detail, /locationPresentationState/);
  assert.match(detail, /Ekipman bilgisi eksik/);
  assert.match(detail, /Konum bakım sırasında doğrulanacak/);
});

test('task detail has persistent directions and maintenance actions and replaces the placeholder route', () => {
  const detail = source(detailFile);
  const app = source(appFile);

  assert.match(detail, /stickyActions/);
  assert.match(detail, /BAKIMI TAMAMLA/);
  assert.match(detail, /YOL TARİFİ/);
  assert.match(app, /TaskDetailScreen/);
  assert.doesNotMatch(app, /TaskDetailPlaceholder/);
  assert.match(app, /onBeginCompletion=\{\(\) => prepareComplete\(pendingTask, pendingAssist\)\}/);
});
