import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./equipment-correction.ts', import.meta.url);

function loadEquipmentCorrection() {
  assert.ok(fs.existsSync(filename), 'equipment correction helper must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('a missing equipment field bootstraps without correction approval', () => {
  const { equipmentCorrectionPayload } = loadEquipmentCorrection();

  assert.deepEqual(
    equipmentCorrectionPayload(
      { coolerCount: 5, towerCount: null, tapCount: 0, smarttapCount: 0 },
      { coolerCount: 5, towerCount: 1, tapCount: 0, smarttapCount: 0 },
      false,
    ),
    {},
  );
});

test('changing an existing equipment field requires explicit correction approval', () => {
  const { equipmentCorrectionPayload } = loadEquipmentCorrection();
  const stored = { coolerCount: 5, towerCount: 1, tapCount: 0, smarttapCount: 0 };
  const submitted = { coolerCount: 5, towerCount: 2, tapCount: 0, smarttapCount: 0 };

  assert.throws(
    () => equipmentCorrectionPayload(stored, submitted, false),
    /Ekipman sayısı değişikliğini ayrıca onayla/,
  );
  assert.deepEqual(
    equipmentCorrectionPayload(stored, submitted, true),
    { equipmentCorrectionRequested: true },
  );
});
