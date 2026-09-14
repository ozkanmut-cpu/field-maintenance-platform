import { DifficultyCalibrationResult } from './difficulty-calibration.service';
import { EquipmentProfileAssessment } from './equipment-profile.types';
import { EstimatedServiceEffort } from './service-effort';
export type PointDifficultyState = 'WARMING_UP' | 'ACTIVE';
export type PointDifficultyConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type PointDifficultyProfile = {
  engineVersion?: string;
  featureSchemaVersion?: string;
  pointId: string;
  state: PointDifficultyState;
  confidence: PointDifficultyConfidence;
  maturityState: 'WARMING_UP' | 'ACTIVE';
  score: number | null;
  rawOutcomeScore: number | null;
  calibration: DifficultyCalibrationResult;
  equipmentProfileComplete: boolean;
  equipmentProfile: EquipmentProfileAssessment;
  equipment: { coolerCount: number | null; towerCount: number | null; tapCount: number | null; smarttapCount: number | null };
  serviceEffort: EstimatedServiceEffort;
  geography: { located: boolean; isolated: boolean; nearestNeighborMeters: number | null };
  history: { visits: number; attempts: number; missed: number; completed: number; observedPeriods: number };
  reasons: string[];
  reasonCodes: string[];
};
