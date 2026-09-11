import assert from 'node:assert/strict';
import test from 'node:test';
import { businessWeek, businessWeekKey, sameBusinessWeek } from './business-week';

test('uses Monday-Sunday business week in Europe/Istanbul', () => {
  const monday = businessWeek(new Date('2026-09-07T00:30:00+03:00'));
  const sunday = businessWeek(new Date('2026-09-13T23:59:59+03:00'));

  assert.equal(monday.key, '2026-W37');
  assert.equal(sunday.key, '2026-W37');
  assert.equal(monday.weekStart.toISOString(), '2026-09-07T00:00:00.000Z');
  assert.equal(monday.weekEnd.toISOString(), '2026-09-13T00:00:00.000Z');
  assert.equal(monday.startInstant.toISOString(), '2026-09-06T21:00:00.000Z');
  assert.equal(monday.endExclusiveInstant.toISOString(), '2026-09-13T21:00:00.000Z');
});

test('business timezone decides the week near UTC midnight', () => {
  const beforeIstanbulMonday = new Date('2026-09-06T20:59:59.000Z');
  const atIstanbulMonday = new Date('2026-09-06T21:00:00.000Z');

  assert.equal(businessWeekKey(beforeIstanbulMonday), '2026-W36');
  assert.equal(businessWeekKey(atIstanbulMonday), '2026-W37');
});

test('handles ISO week-year boundaries', () => {
  assert.equal(businessWeekKey(new Date('2025-12-29T12:00:00+03:00')), '2026-W01');
  assert.equal(businessWeekKey(new Date('2026-01-04T12:00:00+03:00')), '2026-W01');
  assert.equal(businessWeekKey(new Date('2026-01-05T12:00:00+03:00')), '2026-W02');
});

test('sameBusinessWeek compares canonical business weeks', () => {
  assert.equal(
    sameBusinessWeek(
      new Date('2026-09-07T00:00:00+03:00'),
      new Date('2026-09-13T23:59:59+03:00'),
    ),
    true,
  );
  assert.equal(
    sameBusinessWeek(
      new Date('2026-09-13T23:59:59+03:00'),
      new Date('2026-09-14T00:00:00+03:00'),
    ),
    false,
  );
});

test('rejects invalid dates', () => {
  assert.throws(() => businessWeek(new Date('invalid')), /Invalid date/);
});
