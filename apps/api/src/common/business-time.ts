const BUSINESS_TIME_ZONE = 'Europe/Istanbul';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsMap(formatter: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
}

export function businessDateKey(date: Date) {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const parts = partsMap(dateFormatter, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function nextDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function zonedMidnightUtc(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = targetUtc;
  for (let i = 0; i < 2; i += 1) {
    const parts = partsMap(dateTimeFormatter, new Date(candidate));
    const representedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    candidate = targetUtc - (representedAsUtc - candidate);
  }
  return new Date(candidate);
}

export function dateOnlyForBusinessDate(date: Date) {
  return new Date(`${businessDateKey(date)}T00:00:00.000Z`);
}

export function businessDayRange(date: Date) {
  const key = businessDateKey(date);
  return { key, start: zonedMidnightUtc(key), end: zonedMidnightUtc(nextDateKey(key)) };
}
