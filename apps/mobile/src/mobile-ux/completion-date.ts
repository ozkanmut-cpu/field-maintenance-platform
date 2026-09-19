const businessFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
});

function keyFor(date: Date) {
  const parts = Object.fromEntries(businessFormatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateFromKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function addDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

export function completionDateBounds(now = new Date()) {
  const max = keyFor(now);
  const today = dateFromKey(max)!;
  const weekday = today.getUTCDay() || 7;
  const previousMonday = addDays(addDays(today, 1 - weekday), -7);
  return { min: previousMonday.toISOString().slice(0, 10), max };
}

export function isAllowedCompletionDate(value: string, now = new Date()) {
  const bounds = completionDateBounds(now);
  return Boolean(dateFromKey(value) && value >= bounds.min && value <= bounds.max);
}

export function completionPerformedAt(value: string, now = new Date()) {
  const { max } = completionDateBounds(now);
  if (value === max) return now.toISOString();
  return `${value}T12:00:00.000Z`;
}
