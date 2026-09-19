import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const equipmentFile = new URL('./equipment.ts', import.meta.url);

function loadEquipment() {
  assert.ok(fs.existsSync(equipmentFile), 'equipment helper must exist');
  const source = fs.readFileSync(equipmentFile, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

const completeEquipment = { coolerCount: 2, towerCount: 1, tapCount: 4, smarttapCount: 0 };

test('rejects missing, negative, fractional, and non-numeric equipment counts', () => {
  const { parseEquipment } = loadEquipment();

  for (const input of [
    { coolerCount: '', towerCount: '1', tapCount: '4', smarttapCount: '0' },
    { coolerCount: '-1', towerCount: '1', tapCount: '4', smarttapCount: '0' },
    { coolerCount: '2.5', towerCount: '1', tapCount: '4', smarttapCount: '0' },
    { coolerCount: 'two', towerCount: '1', tapCount: '4', smarttapCount: '0' },
  ]) {
    assert.deepEqual(parseEquipment(input), { error: 'Tüm ekipman adetlerini 0 veya daha büyük tam sayı olarak gir.' });
  }
});

test('accepts zero as a valid equipment count', () => {
  const { parseEquipment } = loadEquipment();

  assert.deepEqual(parseEquipment({ coolerCount: '0', towerCount: '1', tapCount: '4', smarttapCount: '0' }), {
    values: { coolerCount: 0, towerCount: 1, tapCount: 4, smarttapCount: 0 },
  });
});

test('reports equipment changes only for fields whose numeric value changed', () => {
  const { equipmentDiff } = loadEquipment();

  assert.deepEqual(equipmentDiff(completeEquipment, completeEquipment), []);
  assert.deepEqual(equipmentDiff(completeEquipment, { ...completeEquipment, tapCount: 5 }), [
    { key: 'tapCount', label: 'Musluk', before: 4, after: 5 },
  ]);
});

test('compares equipment edits by their normalized numeric intent', () => {
  const { equipmentInputChangesIntent } = loadEquipment();
  const current = { coolerCount: '02', towerCount: '1', tapCount: '4', smarttapCount: '0' };

  assert.equal(equipmentInputChangesIntent(current, { ...current, coolerCount: '2' }), false);
  assert.equal(equipmentInputChangesIntent(current, { ...current, tapCount: '5' }), true);
});
