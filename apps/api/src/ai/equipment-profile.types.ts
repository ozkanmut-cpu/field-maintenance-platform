export type EquipmentProfileConfidence = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
export type EquipmentProfileStability = 'UNKNOWN' | 'STABLE' | 'CHANGING' | 'VOLATILE';

export type EquipmentProfileAssessment = {
  engineVersion: string;
  featureSchemaVersion: string;
  maturityState: 'WARMING_UP' | 'ACTIVE';
  pointId: string;
  confidence: EquipmentProfileConfidence;
  confidenceScore: number;
  complete: boolean;
  verifiedVisitCount: number;
  lastVerifiedAt: string | null;
  verificationAgeDays: number | null;
  observedSnapshotCount: number;
  changeCount: number;
  changeRate: number | null;
  stability: EquipmentProfileStability;
  anomalyCodes: string[];
  reasons: string[];
  reasonCodes: string[];
};
