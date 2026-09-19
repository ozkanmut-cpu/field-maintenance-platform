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
  assert.match(app, /popScreen\(screenHistoryRef\.current, screenRef\.current\)/);
  assert.match(app, /back=\{goBack\}/);
});
