import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { addUtcDays, firstRutWeekStartingAfter, rutWeekSlot } from './rut-schedule';

const anchor = new Date('2026-08-31T00:00:00.000Z');

test('SmartClean never schedules before the 8-week threshold', () => {
  const base = new Date('2026-07-01T00:00:00.000Z');
  const threshold = addUtcDays(base, 56);
  const week1 = firstRutWeekStartingAfter(threshold, 1, anchor);
  const week2 = firstRutWeekStartingAfter(threshold, 2, anchor);
  assert.equal(week1.start.toISOString().slice(0, 10), '2026-08-31');
  assert.equal(week2.start.toISOString().slice(0, 10), '2026-09-07');
  assert.ok(week1.start >= threshold);
  assert.ok(week2.start >= threshold);
});

test('Monday threshold schedules only after that threshold week starts', () => {
  const threshold = new Date('2026-08-31T00:00:00.000Z');
  assert.equal(firstRutWeekStartingAfter(threshold, 1, anchor).start.toISOString().slice(0, 10), '2026-09-14');
});

test('rut parity remains stable in 14-day cycles', () => {
  const first = new Date('2026-08-31T00:00:00.000Z');
  assert.equal(rutWeekSlot(first, anchor), 1);
  assert.equal(rutWeekSlot(addUtcDays(first, 14), anchor), 1);
  assert.equal(rutWeekSlot(addUtcDays(first, 7), anchor), 2);
});
