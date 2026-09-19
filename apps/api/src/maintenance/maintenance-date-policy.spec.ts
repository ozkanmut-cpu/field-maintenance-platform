import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { evaluateMaintenanceDate } from './maintenance-date-policy';

const now = new Date('2026-09-19T09:00:00.000Z'); // Saturday, 19 September in Istanbul

test('allows today and dates from Monday of the prior week, and marks only past dates', () => {
  const today = evaluateMaintenanceDate(new Date('2026-09-19T12:00:00.000Z'), now);
  assert.equal(today.allowed, true);
  assert.equal(today.enteredLate, false);

  const earliest = evaluateMaintenanceDate(new Date('2026-09-07T12:00:00.000Z'), now);
  assert.equal(earliest.allowed, true);
  assert.equal(earliest.enteredLate, true);
  assert.equal(earliest.earliestDateKey, '2026-09-07');
});

test('rejects dates older than the prior Monday and future business dates', () => {
  assert.equal(evaluateMaintenanceDate(new Date('2026-09-06T12:00:00.000Z'), now).allowed, false);
  assert.equal(evaluateMaintenanceDate(new Date('2026-09-20T12:00:00.000Z'), now).allowed, false);
});

test('past-dated maintenance is explicitly location-exempt', () => {
  const past = evaluateMaintenanceDate(new Date('2026-09-10T12:00:00.000Z'), now);
  assert.equal(past.enteredLate, true);
  assert.equal(past.locationRequired, false);

  const today = evaluateMaintenanceDate(new Date('2026-09-19T12:00:00.000Z'), now);
  assert.equal(today.locationRequired, true);
});
