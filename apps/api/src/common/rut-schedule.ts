export type RutWindow = { start: Date; end: Date };

export function addUtcDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function startOfRutWeek(date: Date) {
  const day = date.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  return addUtcDays(date, delta);
}

export function rutWeekSlot(monday: Date, week1Anchor: Date) {
  const anchor = startOfRutWeek(week1Anchor);
  const weekStart = startOfRutWeek(monday);
  const diffWeeks = Math.floor((weekStart.getTime() - anchor.getTime()) / 604_800_000);
  const parity = ((diffWeeks % 2) + 2) % 2;
  return parity === 0 ? 1 : 2;
}

export function firstRutWeekStartingAfter(
  threshold: Date,
  maintenanceWeek: number,
  week1Anchor: Date,
): RutWindow {
  if (![1, 2].includes(maintenanceWeek)) throw new Error('maintenanceWeek must be 1 or 2');
  let start = startOfRutWeek(threshold);
  if (start <= threshold) start = addUtcDays(start, 7);
  if (rutWeekSlot(start, week1Anchor) !== maintenanceWeek) start = addUtcDays(start, 7);
  return { start, end: addUtcDays(start, 6) };
}
