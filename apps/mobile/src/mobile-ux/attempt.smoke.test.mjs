import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screenFile = new URL('./AttemptScreen.tsx', import.meta.url);
const detailFile = new URL('./TaskDetailScreen.tsx', import.meta.url);
const appFile = new URL('../CorporateApp.tsx', import.meta.url);

function source(file) {
  assert.ok(fs.existsSync(file), `${file.pathname} must exist`);
  return fs.readFileSync(file, 'utf8');
}

test('attempt form offers every backend-supported reason and an optional note before submission', () => {
  const screen = source(screenFile);

  for (const reason of ['BUSINESS_CLOSED', 'AUTHORIZED_PERSON_UNAVAILABLE', 'ACCESS_FAILED', 'OTHER']) {
    assert.match(screen, new RegExp(`reason: '${reason}'`));
  }
  assert.match(screen, /İşletme kapalı/);
  assert.match(screen, /Yetkili kişi yok/);
  assert.match(screen, /Erişim sağlanamadı/);
  assert.match(screen, /Diğer/);
  assert.match(screen, /Not <Text style=\{styles\.optional\}>\(isteğe bağlı\)<\/Text>/);
  assert.match(screen, /<TextInput/);
});

test('attempt form uses concise copy and clearly states that the task remains open for admin review', () => {
  const screen = source(screenFile);

  assert.doesNotMatch(screen, /Konum bilgisi gönderilecek/);
  assert.doesNotMatch(screen, /doğruluk bilgisini/);
  assert.match(screen, /Görev, yönetici karar verene kadar açık kalır/);
});

test('task detail routes maintenance failure into the attempt form rather than a native alert', () => {
  const detail = source(detailFile);
  const app = source(appFile);

  assert.match(detail, /onBeginAttempt/);
  assert.match(detail, /BAKIM YAPILAMADI/);
  assert.match(app, /screen === 'ATTEMPT'/);
  assert.match(app, /<AttemptScreen/);
  assert.match(app, /onBeginAttempt=\{\(\) => prepareAttempt\(pendingTask, pendingAssist\)\}/);
  assert.doesNotMatch(app, /function attemptReason\(/);
  assert.doesNotMatch(app, /Alert\.alert\('Bakım yapılamadı'/);
});

test('attempt submission retains the full captured payload for identical retries and clears it on edits', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /testID="maintenance-attempt-save"/);
  assert.match(screen, /disabled=\{submitting\}/);
  assert.match(screen, /submitting \? 'GÖNDERİLİYOR\.\.\.'/);
  assert.match(app, /new SubmissionIntentStore<AttemptSubmitIntent, AttemptSubmitPayload>\(\)/);
  assert.match(app, /const attemptInFlight = useRef\(false\)/);
  assert.match(app, /if \(attemptInFlight\.current\) return;\s+attemptInFlight\.current = true;[\s\S]*await currentLocation\(\)/);
  assert.match(app, /attemptSubmission\.current\.retryPayload\(intent\)/);
  assert.match(app, /attemptSubmission\.current\.remember\(intent, [\s\S]*locationCapturedAt:[\s\S]*idempotencyKey/);
  assert.match(app, /recordMaintenanceAttempt\(payload\)/);
  assert.match(app, /trimmedNote \? \{ note: trimmedNote \} : \{\}/);
  assert.match(screen, /onIntentChange/);
  assert.match(app, /onIntentChange=\{\(\) => attemptSubmission\.current\.clear\(\)\}/);
});

test('successful attempts return to Jobs with feedback instead of a system alert', () => {
  const app = source(appFile);

  assert.match(app, /setToastMessage\('Bakım yapılamadığı kaydı yönetici onayına gönderildi\.'\)/);
  assert.match(app, /setScreen\('TASKS'\)/);
  assert.match(app, /<Toast message=\{toastMessage\}/);
  assert.doesNotMatch(app, /Alert\.alert\('Admin onayına gönderildi'/);
});

test('a completed attempt is not reported as failed when the Jobs refresh is unavailable', () => {
  const app = source(appFile);

  assert.match(app, /setScreen\('TASKS'\);\s+setToastMessage\('Bakım yapılamadığı kaydı yönetici onayına gönderildi\.'\);\s+void loadTasks\(assistedForTechnicianId\);/);
  assert.doesNotMatch(app, /setToastMessage\('Bakım yapılamadığı kaydı yönetici onayına gönderildi\.'\);\s+await loadTasks\(assistedForTechnicianId\);/);
});
