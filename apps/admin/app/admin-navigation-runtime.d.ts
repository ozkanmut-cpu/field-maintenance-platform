import type { AdminLocation, AdminSection } from './admin-navigation';

export function parseAdminLocation(search: string): AdminLocation;
export function buildAdminLocation(section: AdminSection, values?: Omit<AdminLocation, 'section'>): string;
export function pointListValues(values: { query?: string; status?: string; region?: string; maintenanceType?: string; page?: number; scrollY?: number }): Omit<AdminLocation, 'section'>;
export function pointListScrollKey(values: Omit<AdminLocation, 'section'>): string;
