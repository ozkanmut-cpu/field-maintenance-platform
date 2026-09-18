import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('admin page synchronizes navigation with browser history', () => {
  assert.match(source, /window\.addEventListener\('popstate'/);
  assert.match(source, /window\.history\.pushState/);
  assert.match(source, /parseAdminLocation\(window\.location\.search\)/);
  assert.match(source, /AdminShell/);
});

test('new user is an action within users instead of a sidebar section', () => {
  assert.doesNotMatch(source, /setSection\('new-user'\)/);
  assert.match(source, /Yeni Kullanıcı/);
  assert.match(source, /createUserOpen/);
});
