import { businessDateKey } from '../common/business-time';

export type MaintenanceDateDecision = {
  allowed: boolean;
  enteredLate: boolean;
  locationRequired: boolean;
  earliestDateKey: string;
  reason: string | null;
};

/**
 * Maintenance is recorded for an Istanbul business date. Technicians may correct
 * only the current week and the immediately preceding Monday-to-Sunday period.
 */
export function evaluateMaintenanceDate(performedAt: Date, now = new Date()): MaintenanceDateDecision {
  const performedDateKey = businessDateKey(performedAt);
  const nowDateKey = businessDateKey(now);
  const earliestDateKey = previousWeekMonday(nowDateKey);
  const enteredLate = performedDateKey < nowDateKey;

  if (performedDateKey > nowDateKey) {
    return { allowed: false, enteredLate: false, locationRequired: true, earliestDateKey, reason: 'Bakım tarihi gelecekte olamaz' };
  }
  if (performedDateKey < earliestDateKey) {
    return { allowed: false, enteredLate: true, locationRequired: false, earliestDateKey, reason: `Bakım tarihi ${earliestDateKey} tarihinden önce olamaz` };
  }
  return { allowed: true, enteredLate, locationRequired: !enteredLate, earliestDateKey, reason: null };
}

function previousWeekMonday(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - mondayOffset - 7);
  return utc.toISOString().slice(0, 10);
}
