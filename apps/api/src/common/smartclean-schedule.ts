import { addUtcDays, firstRutWeekStartingAfter } from './rut-schedule';

export function nextSmartcleanDueDate(
  baseDate: Date,
  maintenanceWeek: number,
  week1Anchor: Date,
  closedDueDate?: Date | null,
) {
  const threshold = addUtcDays(baseDate, 56);
  let dueDate = firstRutWeekStartingAfter(threshold, maintenanceWeek, week1Anchor).start;
  while (closedDueDate && dueDate <= closedDueDate) dueDate = addUtcDays(dueDate, 14);
  return dueDate;
}
