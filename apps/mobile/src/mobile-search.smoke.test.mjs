import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const api = fs.readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
const jobs = fs.readFileSync(new URL('./mobile-ux/TasksScreen.tsx', import.meta.url), 'utf8');
const customers = fs.readFileSync(new URL('./mobile-ux/CustomersScreen.tsx', import.meta.url), 'utf8');
const presentation = fs.readFileSync(new URL('./mobile-ux/task-presentation.ts', import.meta.url), 'utf8');

test('mobile search payload types expose aliases', () => {
  assert.match(api, /type MyCustomer[\s\S]*aliases\?:\s*string\[\]/);
  assert.match(api, /type DueTask[\s\S]*aliases\?:\s*string\[\]/);
});

test('Jobs search includes address and old-name aliases', () => {
  assert.match(jobs, /filterTasks\(dashboard\.due, search\)/);
  assert.match(presentation, /matchesSearch\(query,\s*\[\s*task\.pointName,\s*task\.pointCode,\s*task\.regionName,\s*task\.address\s*\?\?\s*'',\s*\.\.\.\(task\.aliases\s*\?\?\s*\[\]\),?\s*\]\)/);
});

test('My Customers search includes address and old-name aliases', () => {
  assert.match(customers, /matchesSearch\(search,\s*\[customer\.name,\s*customer\.code,\s*customer\.region\?\.name\s*\?\?\s*'',\s*customer\.address\s*\?\?\s*'',\s*\.\.\.\(customer\.aliases\s*\?\?\s*\[\]\)\]\)/);
});
