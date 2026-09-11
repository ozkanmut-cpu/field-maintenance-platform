import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { nextSmartcleanDueDate } from './smartclean-schedule';

const anchor = new Date('2026-08-31T00:00:00.000Z');

test('SmartClean due is 8 weeks plus the next matching rut week', () => {
  const base = new Date('2026-07-01T00:00:00.000Z');
  assert.equal(nextSmartcleanDueDate(base, 1, anchor).toISOString().slice(0, 10), '2026-08-31');
  assert.equal(nextSmartcleanDueDate(base, 2, anchor).toISOString().slice(0, 10), '2026-09-07');
});

test('approved closed due advances by complete 14-day rut cycles', () => {
  const base = new Date('2026-07-01T00:00:00.000Z');
  const closed = new Date('2026-09-01T00:00:00.000Z');
  assert.equal(nextSmartcleanDueDate(base, 1, anchor, closed).toISOString().slice(0, 10), '2026-09-14');
});
