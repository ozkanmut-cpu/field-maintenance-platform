import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./maintenance-location-flow.ts', import.meta.url);

function loadFlow() {
  assert.ok(fs.existsSync(filename), 'maintenance location flow boundary must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

const point = { latitude: 38.42, longitude: 27.13 };
const closeLocation = { latitude: 38.421, longitude: 27.13, accuracyMeters: 18 };
const realisticMismatch = { latitude: 38.4236, longitude: 27.13, accuracyMeters: 27 };
test('historical date bypasses GPS and never offers the location modal', () => {
  const { planMaintenanceLocation } = loadFlow();
  assert.deepEqual(planMaintenanceLocation({ pastDated: true, pointLocation: point }), {
    kind: 'PAST_DATE',
  });
});

test('trusted current location within 250m saves without an unnecessary prompt', () => {
  const { planMaintenanceLocation } = loadFlow();
  const result = planMaintenanceLocation({
    pastDated: false, currentLocation: closeLocation, pointLocation: point,
  });
  assert.equal(result.kind, 'SAVE_CURRENT');
  assert.equal(result.locationPresenceConfirmed, true);
  assert.deepEqual(result.currentLocation, closeLocation);
});

test('a realistic approximately 400m mismatch exposes the three exact choices', () => {
  const { planMaintenanceLocation, LOCATION_CHOICES } = loadFlow();
  const result = planMaintenanceLocation({
    pastDated: false, currentLocation: realisticMismatch, pointLocation: point,
  });
  assert.equal(result.kind, 'PROMPT');
  assert.equal(result.detail, 'Kayıtlı noktadan yaklaşık 400 metre uzaktasınız.');
  assert.deepEqual(LOCATION_CHOICES, {
    HERE: 'Evet, noktadayım',
    COMPLETED_ELSEWHERE: 'Hayır, ama bakımı yaptım',
    CANCEL: 'İptal et',
  });
  assert.equal(result.currentLocation.accuracyMeters, 27);
  assert.notEqual(result.currentLocation.accuracyMeters, 999);
});
test('each confirmation saves once with its presence decision while cancel writes nothing', async () => {
  const { applyMaintenanceLocationChoice } = loadFlow();
  const writes = [];
  const save = async (locationPresenceConfirmed) => {
    writes.push(locationPresenceConfirmed);
    return { status: 'VALID' };
  };

  const yes = await applyMaintenanceLocationChoice('HERE', save);
  const no = await applyMaintenanceLocationChoice('COMPLETED_ELSEWHERE', save);
  const cancel = await applyMaintenanceLocationChoice('CANCEL', save);

  assert.deepEqual(yes, { saved: true, locationPresenceConfirmed: true, value: { status: 'VALID' } });
  assert.deepEqual(no, { saved: true, locationPresenceConfirmed: false, value: { status: 'VALID' } });
  assert.deepEqual(cancel, { saved: false });
  assert.deepEqual(writes, [true, false]);
});
