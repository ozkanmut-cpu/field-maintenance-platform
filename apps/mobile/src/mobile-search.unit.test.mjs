import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = new URL('./search.ts', import.meta.url);

function loadSearch() {
  assert.ok(fs.existsSync(filename), 'mobile search helper must exist');
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports;
}

test('search matches Turkish text, address and old-name aliases', () => {
  const { matchesSearch } = loadSearch();
  const values = ['İzmir Büfe', 'C-17', 'Urla', 'İskele Caddesi 10', 'Eski Meyhane'];
  assert.equal(matchesSearch('izmir', values), true);
  assert.equal(matchesSearch('iskele caddesi', values), true);
  assert.equal(matchesSearch('eski meyhane', values), true);
  assert.equal(matchesSearch('bornova', values), false);
});
