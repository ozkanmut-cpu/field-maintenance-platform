import { AiRiskSeverity } from './risk-engine.types';

export type PlanningRecommendationType =
  | 'PRIORITIZE_CARRYOVER'
  | 'REVIEW_WORKLOAD_BALANCE'
  | 'REVIEW_ROUTE'
  | 'FIX_DATA_QUALITY';

export type PlanningRecommendation = {
  id: string;
  type: PlanningRecommendationType;
  technicianId: string;
  priority: number;
  severity: AiRiskSeverity;
  confidence: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
  titleCode: string;
  reasonCodes: string[];
  evidence: Record<string, string | number | boolean | null>;
  constraints: string[];
};

export type PlanningAssessment = {
  engineVersion: string;
  featureSchemaVersion?: string;
  state: 'INSUFFICIENT_DATA' | 'READY';
  recommendations: PlanningRecommendation[];
  reasons: string[];
};
