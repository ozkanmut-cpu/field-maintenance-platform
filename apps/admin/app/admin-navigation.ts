import type { AdminIconName } from './admin-icons';

export type AdminSection =
  | 'dashboard' | 'maintenance-calendar' | 'assignments' | 'non-maintenance-visits' | 'paperwork'
  | 'approvals' | 'anomalies' | 'points' | 'point-detail' | 'bulk-operations' | 'setup-pending'
  | 'regions' | 'location-matching' | 'duplicates' | 'point-timeline' | 'prospects'
  | 'kpi-reporting' | 'technician-daily-summary' | 'ai-dashboard' | 'sap-sync' | 'users'
  | 'help-targets' | 'audit-log';

export type NavigationItem = {
  section: AdminSection;
  label: string;
  group: string;
  icon: AdminIconName;
};

export const navigationItems: NavigationItem[] = [
  { section: 'dashboard', label: 'Operasyon Dashboard', group: 'Ana Sayfa', icon: 'dashboard' },
  { section: 'maintenance-calendar', label: 'Bakım Takvimi / Yükümlülükler', group: 'Operasyon', icon: 'calendar' },
  { section: 'assignments', label: 'Görevlendirmeler', group: 'Operasyon', icon: 'assignment' },
  { section: 'non-maintenance-visits', label: 'Bakım Dışı Ziyaretler', group: 'Operasyon', icon: 'visit' },
  { section: 'paperwork', label: 'Evrak Yönetimi', group: 'Operasyon', icon: 'documents' },
  { section: 'approvals', label: 'Yapılamadı Onayları', group: 'Onay & İnceleme', icon: 'approval' },
  { section: 'anomalies', label: 'Konum & Anomali İnceleme', group: 'Onay & İnceleme', icon: 'warning' },
  { section: 'points', label: 'Noktalar', group: 'Nokta Yönetimi', icon: 'points' },
  { section: 'setup-pending', label: 'Ayar Bekleyenler', group: 'Nokta Yönetimi', icon: 'settings' },
  { section: 'regions', label: 'Bölgeler', group: 'Nokta Yönetimi', icon: 'regions' },
  { section: 'location-matching', label: 'SAP / Google Eşleştirme', group: 'Nokta Yönetimi', icon: 'map' },
  { section: 'duplicates', label: 'Mükerrer Noktalar', group: 'Nokta Yönetimi', icon: 'duplicate' },
  { section: 'point-timeline', label: 'Nokta Timeline', group: 'Nokta Yönetimi', icon: 'timeline' },
  { section: 'prospects', label: 'Potansiyel Müşteriler', group: 'Nokta Yönetimi', icon: 'prospects' },
  { section: 'bulk-operations', label: 'Toplu İşlemler', group: 'Nokta Yönetimi', icon: 'settings' },
  { section: 'kpi-reporting', label: 'KPI / Raporlama', group: 'Raporlar & Analiz', icon: 'analytics' },
  { section: 'technician-daily-summary', label: 'Teknisyen Günlük Özeti', group: 'Raporlar & Analiz', icon: 'users' },
  { section: 'ai-dashboard', label: 'Sanal İstatistikçi', group: 'Raporlar & Analiz', icon: 'analytics' },
  { section: 'sap-sync', label: 'SAP Senkronizasyonu', group: 'Entegrasyonlar', icon: 'refresh' },
  { section: 'users', label: 'Kullanıcılar', group: 'Kullanıcı Yönetimi', icon: 'users' },
  { section: 'help-targets', label: 'Yardım Yetkileri', group: 'Kullanıcı Yönetimi', icon: 'users' },
  { section: 'audit-log', label: 'İşlem Geçmişi', group: 'Sistem', icon: 'history' },
];

export type AdminLocation = { section: AdminSection; pointId?: string; detailTab?: string; query?: string; page?: string };

const sections = new Set<AdminSection>(navigationItems.map((item) => item.section).concat('point-detail'));

export function parseAdminLocation(search: string): AdminLocation {
  const params = new URLSearchParams(search);
  const candidate = params.get('section') as AdminSection | null;
  return {
    section: candidate && sections.has(candidate) ? candidate : 'dashboard',
    ...(params.get('pointId') ? { pointId: params.get('pointId')! } : {}),
    ...(params.get('tab') ? { detailTab: params.get('tab')! } : {}),
    ...(params.get('query') ? { query: params.get('query')! } : {}),
    ...(params.get('page') ? { page: params.get('page')! } : {}),
  };
}

export function buildAdminLocation(section: AdminSection, values: Omit<AdminLocation, 'section'> = {}): string {
  const params = new URLSearchParams({ section });
  if (values.pointId) params.set('pointId', values.pointId);
  if (values.detailTab) params.set('tab', values.detailTab);
  if (values.query) params.set('query', values.query);
  if (values.page) params.set('page', values.page);
  return `?${params.toString()}`;
}

export function getNavigationItem(section: AdminSection): NavigationItem {
  return navigationItems.find((item) => item.section === section) ?? navigationItems[0];
}
