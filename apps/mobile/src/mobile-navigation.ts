export type MobileScreen =
  | 'TASKS' | 'NEARBY' | 'CUSTOMERS' | 'CUSTOMER' | 'EQUIPMENT_CONFIRM'
  | 'HELP' | 'MISSING_ITEMS' | 'NEW' | 'HISTORY' | 'EFESIM_RESULT' | 'PROSPECT' | 'VISIT_SAVED' | 'SUCCESS'
  | 'NON_MAINTENANCE_VISIT' | 'NON_MAINTENANCE_FORM' | 'NON_MAINTENANCE_VISIT_SAVED';

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

export type MobileDialog = 'ATTEMPT_REASON' | 'LOCATION_CONFIRMATION';

export type HardwareBackAction =
  | { type: 'DISMISS_DIALOG'; dialog: MobileDialog }
  | { type: 'NAVIGATE'; screen: MobileScreen; history: MobileScreen[] }
  | { type: 'STAY' };

export function resolveHardwareBack(
  dialog: MobileDialog | null,
  history: MobileScreen[],
  current: MobileScreen,
): HardwareBackAction {
  if (dialog) return { type: 'DISMISS_DIALOG', dialog };
  if (current === 'EQUIPMENT_CONFIRM') return { type: 'NAVIGATE', screen: 'TASKS', history: [] };
  const previous = popScreen(history, current);
  return previous ? { type: 'NAVIGATE', ...previous } : { type: 'STAY' };
}