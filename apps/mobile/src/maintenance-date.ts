export type MaintenanceCalendarDay = {
  dateKey: string;
  dayOfMonth: number;
  monthKey: string;
  disabled: boolean;
};

export function previousWeekMonday(dateKey: string) {
  const date = fromDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) - 7);
  return toDateKey(date);
}

export function maintenanceDateBounds(todayDateKey: string) {
  return {
    selectedDateKey: todayDateKey,
    minimumDateKey: previousWeekMonday(todayDateKey),
    maximumDateKey: todayDateKey,
  };
}

export function isSelectableMaintenanceDate(dateKey: string, todayDateKey: string) {
  const { minimumDateKey, maximumDateKey } = maintenanceDateBounds(todayDateKey);
  return dateKey >= minimumDateKey && dateKey <= maximumDateKey;
}

export function buildMaintenanceCalendarDays(todayDateKey: string): MaintenanceCalendarDay[] {
  const { minimumDateKey } = maintenanceDateBounds(todayDateKey);
  const cursor = fromDateKey(minimumDateKey);
  cursor.setUTCDate(cursor.getUTCDate() - 7);
  const end = fromDateKey(todayDateKey);
  end.setUTCDate(end.getUTCDate() + (7 - end.getUTCDay()) % 7);

  const days: MaintenanceCalendarDay[] = [];
  while (cursor <= end) {
    const dateKey = toDateKey(cursor);
    days.push({
      dateKey,
      dayOfMonth: cursor.getUTCDate(),
      monthKey: dateKey.slice(0, 7),
      disabled: !isSelectableMaintenanceDate(dateKey, todayDateKey),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function fromDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
