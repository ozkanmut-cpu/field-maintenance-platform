import * as SecureStore from 'expo-secure-store';

export type AuthUser = {
  id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'TECHNICIAN';
  tokenVersion: number;
};

export type EfesimExtractResult = {
  customerName: string | null;
  sapNo: string | null;
  confidence: number | null;
  layoutMatched: boolean | null;
  duplicate: null | { type: 'POINT' | 'PROSPECT'; item: Record<string, unknown> };
  googleMatch: null | {
    attempted: boolean;
    matched: boolean;
    reason?: string;
    placeId?: string;
    name?: string;
    address?: string | null;
    latitude?: number;
    longitude?: number;
    confidence?: number;
    bestCandidate?: {
      placeId: string;
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
      distanceMeters: number;
      nameScore: number;
      score: number;
    };
  };
  nextStep: 'USE_EXISTING' | 'CONFIRM_GOOGLE_MATCH' | 'MANUAL_ENTRY';
  addressPolicy: 'GOOGLE_ONLY';
};

export type ProspectRecord = {
  id: string;
  name: string;
  sapNo?: string | null;
  address?: string | null;
  googlePlaceId?: string | null;
};

export type ProspectVisitPurpose = 'SURVEY' | 'INSTALLATION';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.field-maintenance-prod.com/api';
const TOKEN_KEY = 'fmp.access-token';
let accessToken: string | null = null;

export async function restoreSessionToken() {
  accessToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return accessToken;
}

export async function clearSessionToken() {
  accessToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function saveSessionToken(token: string) {
  accessToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : `HTTP ${response.status}`);
  }
  return body as T;
}

export async function login(username: string, password: string) {
  const result = await jsonRequest<{ user: AuthUser; accessToken: string; tokenType: string; expiresIn: number }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  await saveSessionToken(result.accessToken);
  return result;
}

export function me() {
  return jsonRequest<AuthUser>('/auth/me');
}

export function extractEfesim(input: { technicianId: string; imageBase64: string; latitude: number; longitude: number }) {
  return jsonRequest<EfesimExtractResult>('/prospects/efesim-extract', { method: 'POST', body: JSON.stringify(input) });
}

export function confirmEfesim(input: {
  technicianId: string;
  customerName: string;
  sapNo?: string | null;
  googlePlaceId?: string | null;
  latitude: number;
  longitude: number;
}) {
  return jsonRequest<{ prospect: ProspectRecord; confirmationMode: string; addressEditable: false }>('/prospects/efesim-confirm', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createProspectVisit(input: {
  prospectId: string;
  technicianId: string;
  purpose: ProspectVisitPurpose;
  note?: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  locationCapturedAt: string;
  idempotencyKey: string;
}) {
  return jsonRequest<Record<string, unknown>>('/prospects/visits', { method: 'POST', body: JSON.stringify(input) });
}

export type HelpTarget = { id: string; name: string; username: string };
export type DueTask = {
  pointId: string; pointCode: string; pointName: string; regionName: string;
  maintenanceType: 'STANDARD' | 'SMARTCLEAN'; priority: 'OVERDUE' | 'CURRENT';
  overduePeriods: number; dueStart: string; dueEnd: string;
  address?: string | null; latitude?: number | null; longitude?: number | null;
};
export type TechnicianDashboard = { technician: HelpTarget; overdue: number; current: number; due: DueTask[] };

export function helpTargets() {
  return jsonRequest<HelpTarget[]>('/maintenance/help-targets');
}

export function technicianDashboard(technicianId?: string) {
  const query = technicianId ? `?technicianId=${encodeURIComponent(technicianId)}` : '';
  return jsonRequest<TechnicianDashboard>(`/maintenance/technician-dashboard${query}`);
}

export function completeMaintenance(input: {
  pointId: string;
  assistedForTechnicianId?: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  locationCapturedAt: string;
  deviceRecordedAt?: string;
  idempotencyKey: string;
}) {
  return jsonRequest<Record<string, unknown>>('/maintenance/complete', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type AttemptReason = 'BUSINESS_CLOSED' | 'AUTHORIZED_PERSON_UNAVAILABLE' | 'ACCESS_FAILED' | 'OTHER';

export function recordMaintenanceAttempt(input: {
  pointId: string; assistedForTechnicianId?: string; reason: AttemptReason; note?: string;
  latitude: number; longitude: number; accuracyMeters?: number; locationCapturedAt: string; idempotencyKey: string;
}) {
  return jsonRequest<Record<string, unknown>>('/maintenance/attempt', { method: 'POST', body: JSON.stringify(input) });
}

export type TechnicianHistoryItem = {
  type: 'MAINTENANCE' | 'ATTEMPT' | 'NON_MAINTENANCE_VISIT' | 'PROSPECT_VISIT';
  at: string;
  point?: { id: string; code: string; name: string };
  prospect?: { id: string; name: string; sapNo?: string | null };
  assistedForTechnician?: { id: string; name: string; username: string } | null;
  reason?: AttemptReason;
  purpose?: string;
};

export function technicianHistory(date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return jsonRequest<{ date: string; totalOperations: number; items: TechnicianHistoryItem[] }>(`/maintenance/technician-history${query}`);
}
