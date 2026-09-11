export type TechnicianBaselineState = 'WARMING_UP' | 'ACTIVE';
export type TechnicianBaselineConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type BaselineBand = {
  median: number | null;
  p75: number | null;
  p90: number | null;
};

export type TechnicianWeeklyBaseline = {
  technicianId: string;
  state: TechnicianBaselineState;
  confidence: TechnicianBaselineConfidence;
  observedWeeks: number;
  serviceEvidenceWeeks: number;
  travelEvidenceWeeks: number;
  service: {
    completedVisits: BaselineBand;
    coolerCount: BaselineBand;
    towerCount: BaselineBand;
    tapCount: BaselineBand;
    smarttapCount: BaselineBand;
  };
  travel: {
    routeDistanceMeters: BaselineBand;
    fieldP90RadiusMeters: BaselineBand;
  };
  context: { uniqueVisitedPoints: BaselineBand };
  reasons: string[];
};
