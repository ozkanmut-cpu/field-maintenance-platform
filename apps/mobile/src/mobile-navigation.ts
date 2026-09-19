export type MobileScreen =
  | 'TASKS' | 'NEARBY' | 'CUSTOMERS' | 'CUSTOMER' | 'EQUIPMENT_CONFIRM'
  | 'HELP' | 'MISSING_ITEMS' | 'NEW' | 'HISTORY' | 'EFESIM_RESULT' | 'PROSPECT' | 'VISIT_SAVED' | 'SUCCESS';

export const primaryTabs: ReadonlyArray<{ screen: MobileScreen; label: string; icon: string }> = [
  { screen: 'TASKS', label: 'İşler', icon: 'home' },
  { screen: 'CUSTOMERS', label: 'Müşterilerim', icon: 'building' },
  { screen: 'HISTORY', label: 'Geçmiş', icon: 'clock' },
];

export function pushScreen(history: MobileScreen[], current: MobileScreen, next: MobileScreen): MobileScreen[] {
  if (current === next) return history;
  return [...history, current];
}

export function popScreen(history: MobileScreen[], current: MobileScreen): { screen: MobileScreen; history: MobileScreen[] } | null {
  const previous = history.at(-1);
  if (previous) return { screen: previous, history: history.slice(0, -1) };
  if (current !== 'TASKS') return { screen: 'TASKS', history: [] };
  return null;
}