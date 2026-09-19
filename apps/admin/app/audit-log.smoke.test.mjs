import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./audit-log.tsx', import.meta.url), 'utf8');

test('audit filters are labelled and submit with the keyboard against the supported backend filters', () => {
  assert.match(source, /<form[^>]+onSubmit=/);
  for (const label of ['Audit kaydı ara', 'Entity tipi filtresi', 'İşlem filtresi', 'Kullanıcı filtresi']) {
    assert.match(source, new RegExp(`aria-label="${label}"`), label);
  }
  for (const parameter of ['entityType', 'action', 'actorId']) {
    assert.match(source, new RegExp(`params\\.set\\('${parameter}'`), parameter);
  }
});

test('audit details expose readable before and after JSON in separate disclosures', () => {
  assert.match(source, /<details/);
  assert.match(source, /<summary>Önceki değer<\/summary>/);
  assert.match(source, /<summary>Yeni değer<\/summary>/);
  assert.match(source, /JSON\.stringify\(selected\.oldValue \?\? null, null, 2\)/);
  assert.match(source, /JSON\.stringify\(selected\.newValue \?\? null, null, 2\)/);
});

test('reporting CI runs audit smoke when either audit source or test changes', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/reporting-ci.yml', import.meta.url), 'utf8');
  for (const path of ['apps/admin/app/audit-log.tsx', 'apps/admin/app/audit-log.smoke.test.mjs']) {
    assert.equal(workflow.split(`'${path}'`).length - 1, 2, `${path} must trigger push and pull-request validation`);
  }
  assert.match(workflow, /Reporting admin smoke[\s\S]*apps\/admin\/app\/audit-log\.smoke\.test\.mjs/);
});
