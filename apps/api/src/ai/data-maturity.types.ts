import { FeatureSnapshot } from './feature-store.types';

export type AiMaturityState = 'INACTIVE' | 'WARMING_UP' | 'ACTIVE' | 'RELIABLE';

export type AiCapability =
  | 'CORE'
  | 'GEOGRAPHY'
  | 'CAPACITY'
  | 'RISK'
  | 'ANOMALY'
  | 'RECOMMENDATION'
  | 'SEASONALITY';

export type MaturityEvidence = {
  weeks: number;
  visits: number;
  attempts: number;
  activePoints: number;
  locatedPoints: number;
  activeTechnicians: number;
  regions: number;
  suspiciousVisits: number;
  reviewRecommended: number;
  locationCoverage: number;
};

export type CapabilityMaturity = {
  capability: AiCapability;
  state: AiMaturityState;
  score: number;
  qualityScore: number;
  reasons: string[];
};

export type DataMaturityAssessment = {
  generatedAt: string;
  latestWeekKey: string | null;
  overallState: AiMaturityState;
  overallScore: number;
  evidence: MaturityEvidence;
  capabilities: CapabilityMaturity[];
};

export type SnapshotHistory = FeatureSnapshot[];
