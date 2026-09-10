export type EfesimExtractResult = {
  customerName: string | null;
  sapNo: string | null;
  confidence: number | null;
  layoutMatched: boolean | null;
  duplicate: null | {
    type: 'POINT' | 'PROSPECT';
    item: Record<string, unknown>;
  };
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

export type ConfirmEfesimPayload = {
  technicianId: string;
  customerName: string;
  sapNo?: string | null;
  googlePlaceId?: string | null;
  latitude: number;
  longitude: number;
};

export type ProspectVisitPurpose = 'SURVEY' | 'INSTALLATION';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3000/api';

async function jsonRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message;
    throw new Error(
      Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : `HTTP ${response.status}`,
    );
  }
  return body as T;
}

export function extractEfesim(input: {
  technicianId: string;
  imageBase64: string;
  latitude: number;
  longitude: number;
}) {
  return jsonRequest<EfesimExtractResult>('/prospects/efesim-extract', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function confirmEfesim(payload: ConfirmEfesimPayload) {
  return jsonRequest<{ prospect: ProspectRecord; confirmationMode: string; addressEditable: false }>(
    '/prospects/efesim-confirm',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
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
  return jsonRequest<Record<string, unknown>>('/prospects/visits', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
