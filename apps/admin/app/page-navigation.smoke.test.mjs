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

test('user and help-target detail actions have deep-linkable URL state', () => {
  assert.match(source, /location\.userId/);
  assert.match(source, /location\.createUser/);
  assert.match(source, /navigate\('help-targets', \{ userId: helperId \}\)/);
  assert.match(source, /navigate\('users', \{ createUser: true \}\)/);
});