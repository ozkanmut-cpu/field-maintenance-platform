import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('./CorporateApp.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');

test('mobile search payload types expose aliases', () => {
  assert.match(api, /type MyCustomer[\s\S]*aliases\?:\s*string\[\]/);
  assert.match(api, /type DueTask[\s\S]*aliases\?:\s*string\[\]/);
});

test('Jobs search includes address and old-name aliases', () => {
  assert.match(app, /matchesSearch\(p\.search,\s*\[t\.pointName,\s*t\.pointCode,\s*t\.regionName,\s*t\.address\s*\?\?\s*'',\s*\.\.\.\(t\.aliases\s*\?\?\s*\[\]\)\]\)/);
});

test('My Customers search includes address and old-name aliases', () => {
  assert.match(app, /matchesSearch\(search,\s*\[c\.name,\s*c\.code,\s*c\.region\?\.name\s*\?\?\s*'',\s*c\.address\s*\?\?\s*'',\s*\.\.\.\(c\.aliases\s*\?\?\s*\[\]\)\]\)/);
});
