export type AiLocationState = 'UNKNOWN' | 'WEAK' | 'SUPPORTED' | 'STRONG' | 'CONTRADICTORY';

export type AiLocationAssessment = {
  engineVersion?: string;
  featureSchemaVersion?: string;
  pointId: string;
  state: AiLocationState;
  confidenceScore: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceVisits: number;
  contradictionCount: number;
  reasonCodes: string[];
};
