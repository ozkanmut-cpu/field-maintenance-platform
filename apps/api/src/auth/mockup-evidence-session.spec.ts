import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isMockupEvidenceSessionEnabled } from './mockup-evidence-session';

const enabled = {
  NODE_ENV: 'test',
  MOCKUP_DATASET: 'mobile-evidence',
  MOCKUP_EVIDENCE_SESSION: 'enabled',
  DATABASE_URL: 'postgresql://local@127.0.0.1:5432/field_maintenance_mockup',
};

test('enables a credential-free evidence session only for the explicit local mockup runtime', () => {
  assert.equal(isMockupEvidenceSessionEnabled(enabled), true);
});

test('rejects production and every incomplete mockup evidence configuration', () => {
  for (const env of [
    { ...enabled, NODE_ENV: 'production' },
    { ...enabled, MOCKUP_DATASET: 'anything-else' },
    { ...enabled, MOCKUP_EVIDENCE_SESSION: 'disabled' },
    { ...enabled, DATABASE_URL: 'postgresql://local@db.example.test/field_maintenance_mockup' },
    { ...enabled, DATABASE_URL: 'postgresql://local@127.0.0.1/field_maintenance' },
  ]) assert.equal(isMockupEvidenceSessionEnabled(env), false);
});
