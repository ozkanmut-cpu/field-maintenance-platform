import type { AdminIconName } from './admin-icons';
import { buildAdminLocation as buildLocation, parseAdminLocation as parseLocation } from './admin-navigation-runtime.js';

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

export type AdminLocation = { section: AdminSection; pointId?: string; detailTab?: string; query?: string; status?: string; region?: string; maintenanceType?: string; page?: string; scrollY?: string; userId?: string; createUser?: boolean };

export const parseAdminLocation = (search: string): AdminLocation => parseLocation(search) as AdminLocation;
export const buildAdminLocation = (section: AdminSection, values: Omit<AdminLocation, 'section'> = {}): string => buildLocation(section, values);

export function getNavigationItem(section: AdminSection): NavigationItem {
  return navigationItems.find((item) => item.section === section) ?? navigationItems[0];
}
