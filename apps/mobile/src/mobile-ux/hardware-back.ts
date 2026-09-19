export type TechnicianScreen =
  | 'TASKS' | 'TASK_DETAIL' | 'ATTEMPT' | 'NEARBY' | 'CUSTOMERS' | 'CUSTOMER'
  | 'EQUIPMENT_CONFIRM' | 'NEW' | 'HISTORY' | 'EFESIM_RESULT' | 'PROSPECT'
  | 'VISIT_SAVED' | 'SUCCESS';

export function previousTechnicianScreen(screen: TechnicianScreen): TechnicianScreen | null {
  if (screen === 'EQUIPMENT_CONFIRM' || screen === 'ATTEMPT') return 'TASK_DETAIL';
  if (screen === 'TASK_DETAIL' || screen === 'SUCCESS' || screen === 'VISIT_SAVED') return 'TASKS';
  if (screen === 'CUSTOMER') return 'CUSTOMERS';
  if (screen === 'EFESIM_RESULT') return 'NEW';
  if (screen === 'PROSPECT') return 'EFESIM_RESULT';
  return null;
}
