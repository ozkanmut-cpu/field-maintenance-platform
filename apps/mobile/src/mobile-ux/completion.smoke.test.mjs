import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screenFile = new URL('./CompleteMaintenanceScreen.tsx', import.meta.url);
const appFile = new URL('../CorporateApp.tsx', import.meta.url);

function source(file) {
  assert.ok(fs.existsSync(file), `${file.pathname} must exist`);
  return fs.readFileSync(file, 'utf8');
}

test('completion starts a missing equipment profile from zero and only presents a diff for actual changes', () => {
  const screen = source(screenFile);

  assert.match(screen, /hasRecordedEquipment/);
  assert.match(screen, /equipmentInputFrom\(task, 0\)/);
  assert.match(screen, /useState\(\(\) => !hasRecordedEquipment\(task\)\)/);
  assert.match(screen, /DÜZENLE/);
  assert.match(screen, /editing && diff\.length > 0/);
  assert.match(screen, /equipmentDiff/);
  assert.match(screen, /accessibilityLabel=\{`\$\{label\} adedini azalt`\}/);
  assert.match(screen, /accessibilityLabel=\{`\$\{label\} adedini artır`\}/);
  assert.match(screen, /keyboardType="number-pad"/);
});

test('completion keeps routine location-review copy out of the entry screen', () => {
  const screen = source(screenFile);

  assert.doesNotMatch(screen, /locationPresentationState/);
  assert.doesNotMatch(screen, /Konum kaydı inceleme gerektirebilir/);
  assert.doesNotMatch(screen, /noktada olup olmadığın sorulacak/);
});

test('completion sends low-accuracy, missing-accuracy, and non-finite accuracy evidence through the existing presence decision', () => {
  const app = source(appFile);

  assert.match(app, /locationPresentationState\(\{[\s\S]*accuracyMeters: loc\.coords\.accuracy[\s\S]*\}\) !== 'READY'/);
  assert.match(app, /if \(!locationReviewRequired\) \{[\s\S]*locationPresenceConfirmed: true[\s\S]*saveCompletedTask/);
  assert.match(app, /Alert\.alert\('Noktada mısınız\?'/);
  assert.doesNotMatch(app, /if \(distance !== null && distance <= 250\)/);
});

test('completion locks all equipment inputs, retries the exact payload, and guards snapshot invalidation', () => {
  const screen = source(screenFile);
  const app = source(appFile);

  assert.match(screen, /testID="complete-maintenance-save"/);
  assert.match(screen, /disabled=\{submitting\}/);
  assert.match(screen, /submitting \? 'KAYDEDİLİYOR\.\.\.' :/);
  assert.match(app, /new SubmissionIntentStore<CompletionSubmitIntent, CompletionSubmitPayload>\(\)/);
  assert.match(app, /const completionInFlight = useRef\(false\)/);
  assert.match(app, /if \(completionInFlight\.current\) return;\s+completionInFlight\.current = true;[\s\S]*await currentLocation\(\)/);
  assert.match(app, /text: 'İptal et',[\s\S]*completionInFlight\.current = false/);
  assert.match(app, /finally \{ completionInFlight\.current = false; setBusy\(false\); \}/);
  assert.match(app, /completionSubmission\.current\.retryPayload\(intent\)/);
  assert.match(app, /completionSubmission\.current\.remember\(intent, payload\)/);
  assert.match(app, /completeMaintenance\(payload\)/);
  assert.match(screen, /onIntentChange/);
  assert.match(screen, /<EquipmentEditor[^>]*submitting=\{submitting\}/);
  assert.match(screen, /editable=\{!submitting\}/);
  assert.match(screen, /accessibilityState=\{\{ disabled: submitting \}\}/);
  assert.match(screen, /disabled=\{submitting\}/);
  assert.match(screen, /writeLocked\.current = true/);
  assert.match(screen, /'BAKIMI KAYDET'/);
  assert.doesNotMatch(screen, /BİLGİLER DOĞRU/);
  assert.doesNotMatch(screen, /KONTROL ET/);
  assert.match(screen, /if \(writeLocked\.current \|\| submitting\) return/);
  assert.doesNotMatch(screen, /onPress=\{\(\) => \{ onIntentChange\(\); setEditing\(true\); \}\}/);
  assert.match(app, /onIntentChange=\{\(\) => completionSubmission\.current\.clearIfIdle\(completionInFlight\.current\)\}/);
  assert.match(app, /<CompleteMaintenanceScreen/);
  assert.doesNotMatch(app, /<EquipmentConfirmView/);
});

test('completion bounds the scroll viewport above its sticky action footer', () => {
  const screen = source(screenFile);

  assert.match(screen, /<ScrollView style=\{styles\.scroll\}/);
  assert.match(screen, /scroll:\s*\{\s*flex:\s*1\s*\}/);
  assert.match(screen, /content:\s*\{[^}]*paddingBottom:\s*18/);
  assert.match(screen, /stickyActions:/);
});

test('completion retains the existing distant-location confirmation choices and payload field', () => {
  const app = source(appFile);

  assert.match(app, /Alert\.alert\('Noktada mısınız\?'/);
  assert.match(app, /Hayır, ama bakımı yaptım/);
  assert.match(app, /Evet, noktadayım/);
  assert.match(app, /locationPresenceConfirmed/);
  assert.match(app, /completeMaintenance\(payload\)/);
});

test('a completed maintenance is not reported as failed when the Jobs refresh is unavailable', () => {
  const app = source(appFile);

  assert.match(app, /setScreen\('SUCCESS'\);\s+void loadTasks\(assistedForTechnicianId\);/);
  assert.doesNotMatch(app, /setScreen\('SUCCESS'\);\s+await loadTasks\(assistedForTechnicianId\);/);
});
