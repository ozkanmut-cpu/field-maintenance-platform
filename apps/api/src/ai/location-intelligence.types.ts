export type AiLocationState = 'UNKNOWN' | 'WEAK' | 'SUPPORTED' | 'STRONG' | 'CONTRADICTORY';

export type AiLocationAssessment = {
  pointId: string;
  state: AiLocationState;
  confidenceScore: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceVisits: number;
  contradictionCount: number;
  reasonCodes: string[];
};
