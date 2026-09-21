import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');

test('mobile shell renders only the three approved primary tabs', () => {
  assert.match(app, /primaryTabs\.map\(\(tab\) => <Nav/);
  assert.doesNotMatch(app, /<Nav label="Yakınımdakiler"/);
  assert.doesNotMatch(app, /<Nav label="Yardım Et"/);
});

test('Help remains a Jobs flow and Android hardware back uses the screen history', () => {
  assert.match(app, /onHelp=\{\(\) => void openHelp\(\)\}/);
  assert.match(app, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(app, /resolveHardwareBack\(/);
  assert.match(app, /back=\{goBack\}/);
});

test('attempt reason is a dismissible modal whose close path cannot record an attempt', () => {
  assert.match(app, /<DecisionModal[^>]+open=\{Boolean\(attemptDialog\)\}[^>]+onRequestClose=\{closeAttemptDialog\}/);
  assert.doesNotMatch(app, /Alert\.alert\('Bakım yapılamadı'/);
  assert.match(app, /const closeAttemptDialog = useCallback\(\(\) => setAttemptDialog\(null\), \[\]\);/);
});

test('location decision is a dismissible modal and calendar dismissal remains intact', () => {
  assert.match(app, /<DecisionModal[^>]+open=\{Boolean\(locationDialog\)\}[^>]+onRequestClose=\{closeLocationDialog\}/);
  assert.doesNotMatch(app, /Alert\.alert\('Noktada mısınız\?'/);
  assert.match(app, /<Modal transparent animationType="slide" visible=\{open\} onRequestClose=\{closeCalendar\}>/);
});

test('hardware back applies modal-first navigation and always consumes the event', () => {
  const handler = app.slice(app.indexOf('const handleHardwareBack'), app.indexOf('async function restore'));
  assert.match(handler, /resolveHardwareBack/);
  assert.match(handler, /setPendingTask\(null\)/);
  assert.match(handler, /return true/);
});
