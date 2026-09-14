export type AiLocationState = 'UNKNOWN' | 'WEAK' | 'SUPPORTED' | 'STRONG' | 'CONTRADICTORY';

export type AiLocationAssessment = {
  engineVersion?: string;
  featureSchemaVersion?: string;
  pointId: string;
  state: AiLocationState;
  confidenceScore: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  maturityState: 'WARMING_UP' | 'ACTIVE';
  evidenceVisits: number;
  contradictionCount: number;
  reasonCodes: string[];
};
