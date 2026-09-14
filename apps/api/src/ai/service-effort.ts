export const TOWER_SERVICE_MIN_MINUTES = 15;
export const TOWER_SERVICE_MAX_MINUTES = 30;

export type EstimatedServiceEffort = {
  basis: 'TOWER_COUNT_NORMATIVE';
  towerCount: number | null;
  minMinutes: number | null;
  maxMinutes: number | null;
  midpointMinutes: number | null;
  confidence: 'UNKNOWN' | 'HIGH';
  reasonCodes: string[];
};

export function estimateServiceEffort(towerCount: number | null): EstimatedServiceEffort {
  if (towerCount === null || !Number.isFinite(towerCount) || towerCount < 0) {
    return {
      basis: 'TOWER_COUNT_NORMATIVE', towerCount: null,
      minMinutes: null, maxMinutes: null, midpointMinutes: null,
      confidence: 'UNKNOWN', reasonCodes: ['TOWER_COUNT_REQUIRED_FOR_SERVICE_EFFORT'],
    };
  }
  const normalized = Math.floor(towerCount);
  const minMinutes = normalized * TOWER_SERVICE_MIN_MINUTES;
  const maxMinutes = normalized * TOWER_SERVICE_MAX_MINUTES;
  return {
    basis: 'TOWER_COUNT_NORMATIVE', towerCount: normalized,
    minMinutes, maxMinutes, midpointMinutes: (minMinutes + maxMinutes) / 2,
    confidence: 'HIGH', reasonCodes: ['SERVICE_EFFORT_ESTIMATED_FROM_TOWER_COUNT_15_30_MIN'],
  };
}
