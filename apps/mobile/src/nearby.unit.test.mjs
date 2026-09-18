import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./nearby.ts', import.meta.url);

function loadNearby() {
  assert.ok(fs.existsSync(filename), 'nearby helper must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, (id) => {
    if (id === './api') return { jsonRequest: async () => { throw new Error('test requester was not supplied'); } };
    throw new Error(`unexpected dependency: ${id}`);
  });
  return mod.exports;
}

test('nearby query uses approved defaults and encodes coordinates', async () => {
  const { nearbyPoints } = loadNearby();
  const paths = [];
  const result = await nearbyPoints(
    { latitude: 38.4192, longitude: 27.1287 },
    async path => { paths.push(path); return { count: 0, items: [] }; },
  );
  assert.equal(paths[0], '/points/nearby?latitude=38.4192&longitude=27.1287&radiusMeters=10000&limit=100');
  assert.equal(result.count, 0);
});

test('nearby results are ordered by server distance', () => {
  const { sortNearbyItems } = loadNearby();
  assert.deepEqual(sortNearbyItems([{ id: 'b', distanceMeters: 20 }, { id: 'a', distanceMeters: 10 }]).map(x => x.id), ['a', 'b']);
});

test('nearby tie ordering uses name and code without mutating the input', () => {
  const { sortNearbyItems } = loadNearby();
  const items = [
    { id: 'z', name: 'Zeytin', code: '02', distanceMeters: 20 },
    { id: 'b', name: 'Badem', code: '03', distanceMeters: 20 },
    { id: 'a', name: 'Badem', code: '01', distanceMeters: 20 },
  ];
  assert.deepEqual(sortNearbyItems(items).map(x => x.id), ['a', 'b', 'z']);
  assert.deepEqual(items.map(x => x.id), ['z', 'b', 'a']);
});
