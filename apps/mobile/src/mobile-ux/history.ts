import type { TechnicianHistoryItem } from '../api';

export type HistoryPeriod = 'THIS_WEEK' | 'LAST_WEEK' | 'DATE';
export type HistoryFilter = 'ALL' | TechnicianHistoryItem['type'] | 'HELP';

export type HistoryFilterOption = {
  value: HistoryFilter;
  label: string;
  count: number;
};

export type HistorySelection = {
  period: HistoryPeriod;
  date: string;
};

type HistoryRequest = HistorySelection & { generation: number };

export class HistoryRequestCoordinator {
  private appliedSelection: HistorySelection;
  private failedSelection: HistorySelection | null = null;
  private generation = 0;

  constructor(initial: HistorySelection) {
    this.appliedSelection = initial;
  }

  get applied() {
    return this.appliedSelection;
  }

  get retry() {
    return this.failedSelection;
  }

  begin(candidate: HistorySelection) {
    return { ...candidate, generation: ++this.generation };
  }

  isCurrent(request: HistoryRequest) {
    return request.generation === this.generation;
  }

  commit(request: HistoryRequest) {
    if (!this.isCurrent(request)) return null;
    this.appliedSelection = { period: request.period, date: request.date };
    this.failedSelection = null;
    return this.appliedSelection;
  }

  fail(request: HistoryRequest) {
    if (!this.isCurrent(request)) return null;
    this.failedSelection = { period: request.period, date: request.date };
    return this.failedSelection;
  }
}

const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TYPE_FILTERS: Array<{ value: TechnicianHistoryItem['type']; label: string }> = [
  { value: 'MAINTENANCE', label: 'Bakım' },
  { value: 'ATTEMPT', label: 'Yapılamadı' },
  { value: 'NON_MAINTENANCE_VISIT', label: 'Bakım dışı' },
  { value: 'PROSPECT_VISIT', label: 'Aday müşteri' },
];

export function currentBusinessDate(now = new Date()) {
  if (Number.isNaN(now.getTime())) throw new Error('Geçerli bir tarih seç.');
  const parts = Object.fromEntries(
    BUSINESS_DATE_FORMATTER.formatToParts(now)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isBusinessDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1000 || year > 9998) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateFromKey(value: string) {
  if (!isBusinessDateKey(value)) throw new Error('Geçerli bir tarih seç.');
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function key(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function historyRangeFor(period: HistoryPeriod, selectedDate?: string, now = new Date()) {
  if (period === 'DATE') {
    const selected = dateFromKey(selectedDate ?? '');
    return { from: key(selected), to: key(selected) };
  }

  const today = dateFromKey(currentBusinessDate(now));
  const weekday = today.getUTCDay() || 7;
  const thisMonday = addDays(today, 1 - weekday);
  const monday = period === 'LAST_WEEK' ? addDays(thisMonday, -7) : thisMonday;
  return { from: key(monday), to: key(addDays(monday, 6)) };
}

export function historyDateKeys(from: string, to: string) {
  const start = dateFromKey(from);
  const end = dateFromKey(to);
  if (start.getTime() > end.getTime()) throw new Error('Geçerli bir tarih aralığı seç.');
  const dates: string[] = [];
  for (let date = start; date.getTime() <= end.getTime(); date = addDays(date, 1)) dates.push(key(date));
  return dates;
}

export function canTechnicianRevertHistoryItem(performedAt: string, now = new Date()) {
  const performed = new Date(performedAt);
  if (Number.isNaN(performed.getTime())) return false;
  const today = dateFromKey(currentBusinessDate(now));
  const yesterday = addDays(today, -1);
  const performedKey = currentBusinessDate(performed);
  return performedKey === key(today) || performedKey === key(yesterday);
}

export function availableHistoryFilters(items: TechnicianHistoryItem[]): HistoryFilterOption[] {
  const options: HistoryFilterOption[] = [{ value: 'ALL', label: 'Tümü', count: items.length }];
  for (const option of TYPE_FILTERS) {
    const count = items.filter(item => item.type === option.value).length;
    if (count > 0) options.push({ ...option, count });
  }
  const helpCount = items.filter(item => Boolean(item.assistedForTechnician)).length;
  if (helpCount > 0) options.push({ value: 'HELP', label: 'Yardım', count: helpCount });
  return options;
}

export function filterHistoryItems(items: TechnicianHistoryItem[], filter: HistoryFilter) {
  if (filter === 'ALL') return items;
  if (filter === 'HELP') return items.filter(item => Boolean(item.assistedForTechnician));
  return items.filter(item => item.type === filter);
}
