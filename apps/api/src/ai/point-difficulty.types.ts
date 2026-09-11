export type PointDifficultyState = 'WARMING_UP' | 'ACTIVE';
export type PointDifficultyConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type PointDifficultyProfile = {
  pointId: string;
  state: PointDifficultyState;
  confidence: PointDifficultyConfidence;
  score: number | null;
  equipmentProfileComplete: boolean;
  equipment: { coolerCount: number | null; towerCount: number | null; tapCount: number | null; smarttapCount: number | null };
  geography: { located: boolean; isolated: boolean; nearestNeighborMeters: number | null };
  history: { visits: number; attempts: number; missed: number; completed: number; observedPeriods: number };
  reasons: string[];
};
