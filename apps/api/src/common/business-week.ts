import { businessDateKey, businessDayRange } from './business-time';

export type BusinessWeek = {
  key: string;
  isoYear: number;
  isoWeek: number;
  weekStart: Date;
  weekEnd: Date;
  startInstant: Date;
  endExclusiveInstant: Date;
};

function assertValidDate(date: Date) {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
}

function dateFromKey(key: string) {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error('Invalid business date key');
  }
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== key) throw new Error('Invalid business date key');
  return date;
}

function addUtcDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoWeekParts(monday: Date) {
  const thursday = addUtcDays(monday, 3);
  const isoYear = thursday.getUTCFullYear();

  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = addUtcDays(jan4, 1 - jan4Day);
  const isoWeek = Math.floor((monday.getTime() - firstMonday.getTime()) / 604_800_000) + 1;

  return { isoYear, isoWeek };
}

/**
 * Returns the canonical Sanal Istatistikci week for a timestamp.
 *
 * The timestamp is first interpreted in the business timezone through
 * businessDateKey (Europe/Istanbul), then grouped Monday-Sunday. This is
 * deliberately independent from Point.maintenanceWeek (Standard rut 1/2).
 * weekStart/weekEnd are date-only UTC representations suitable for Prisma
 * @db.Date columns; startInstant/endExclusiveInstant are real Istanbul
 * business-boundary instants for timestamp queries.
 */
export function businessWeek(date: Date): BusinessWeek {
  assertValidDate(date);

  const businessKey = businessDateKey(date);
  const businessDate = dateFromKey(businessKey);
  const day = businessDate.getUTCDay() || 7;
  const monday = addUtcDays(businessDate, 1 - day);
  const sunday = addUtcDays(monday, 6);
  const nextMonday = addUtcDays(monday, 7);
  const { isoYear, isoWeek } = isoWeekParts(monday);

  const startBoundary = businessDayRange(new Date(`${monday.toISOString().slice(0, 10)}T12:00:00.000Z`));
  const endBoundary = businessDayRange(new Date(`${nextMonday.toISOString().slice(0, 10)}T12:00:00.000Z`));

  return {
    key: `${isoYear}-W${String(isoWeek).padStart(2, '0')}`,
    isoYear,
    isoWeek,
    weekStart: monday,
    weekEnd: sunday,
    startInstant: startBoundary.start,
    endExclusiveInstant: endBoundary.start,
  };
}

export function businessWeekKey(date: Date) {
  return businessWeek(date).key;
}

export function sameBusinessWeek(a: Date, b: Date) {
  return businessWeekKey(a) === businessWeekKey(b);
}
