import type { ReactNode, SVGProps } from 'react';

export type AdminIconName =
  | 'dashboard' | 'approval' | 'settings' | 'regions' | 'points' | 'map' | 'analytics'
  | 'warning' | 'calendar' | 'prospects' | 'history' | 'detail' | 'assignment' | 'documents'
  | 'timeline' | 'duplicate' | 'visit' | 'users' | 'addUser' | 'logout' | 'refresh' | 'search'
  | 'filter' | 'edit' | 'view' | 'equipment' | 'check' | 'clock' | 'info' | 'error';

type Props = SVGProps<SVGSVGElement> & { name: AdminIconName; size?: number };

const paths: Record<AdminIconName, ReactNode> = {
  dashboard: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
  approval: <><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.5-1.2.9-1.9-2.1-2.1-1.9.9-1.2-.5L11.5 3h-3l-.7 2-1.2.5-1.9-.9-2.1 2.1.9 1.9-.5 1.2-2 .7v3l2 .7.5 1.2-.9 1.9 2.1 2.1 1.9-.9 1.2.5.7 2h3l.7-2 1.2-.5 1.9.9 2.1-2.1-.9-1.9.5-1.2 2-.7Z"/></>,
  regions: <><circle cx="12" cy="10" r="3"/><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/></>,
  points: <><circle cx="12" cy="9" r="2.5"/><path d="M12 21s5-4.6 5-10a5 5 0 1 0-10 0c0 5.4 5 10 5 10Z"/></>,
  map: <><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z"/><path d="M8 4v13M16 7v13"/></>,
  analytics: <><path d="M4 19h16"/><path d="M6 16V9M11 16V5M16 16v-4M21 16V7"/></>,
  warning: <><path d="M12 4 3.5 19h17Z"/><path d="M12 9v4M12 16h.01"/></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></>,
  prospects: <><circle cx="9" cy="9" r="3"/><path d="M3.5 19c.7-3.1 2.6-4.8 5.5-4.8s4.8 1.7 5.5 4.8"/><path d="M17 8v6M14 11h6"/></>,
  history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v5l3 2"/></>,
  detail: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/></>,
  assignment: <><path d="M5 8h11M13 5l3 3-3 3M19 16H8M11 13l-3 3 3 3"/></>,
  documents: <><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
  timeline: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></>,
  duplicate: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  visit: <><path d="M4 17 17 4M11 4h6v6"/><path d="M4 8v9h9"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3 2.5-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="17" cy="9" r="2"/><path d="M15.5 14.8c2.9-.5 4.8 1 5.3 4.2"/></>,
  addUser: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3 2.5-4.8 5.5-4.8"/><path d="M17 10v6M14 13h6"/></>,
  logout: <><path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4M9 12h8"/></>,
  refresh: <><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/></>,
  search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
  filter: <><path d="M4 5h16l-6 7v5l-4 2v-7Z"/></>,
  edit: <><path d="m4 17-.7 3.7L7 20l11-11-3-3Z"/><path d="m13.5 7.5 3 3"/></>,
  view: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  equipment: <><path d="m4 7 8-4 8 4-8 4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4Z"/><path d="M12 11v10"/></>,
  check: <><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.3 2.3 4.8-5"/></>,
  clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
  info: <><circle cx="12" cy="12" r="8"/><path d="M12 10v6M12 7h.01"/></>,
  error: <><circle cx="12" cy="12" r="8"/><path d="m9 9 6 6M15 9l-6 6"/></>,
};

export function AdminIcon({ name, size = 20, ...props }: Props) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
