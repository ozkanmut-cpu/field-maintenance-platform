import { TechnicianBaselineConfidence } from './technician-baseline.types';

export type AiRiskSeverity = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
export type AiRiskState = 'INSUFFICIENT_DATA' | 'READY';
export type AiMaturityOutputState = 'INACTIVE' | 'WARMING_UP' | 'ACTIVE' | 'RELIABLE' | 'UNKNOWN';
export type AiDataQualityOutputState = 'BLOCKED' | 'LIMITED' | 'READY';

export type AiRiskSignal = {
  code: string;
  severity: Exclude<AiRiskSeverity, 'UNKNOWN'>;
  evidence: Record<string, string | number | boolean | null>;
};

export type PointRiskAssessment = {
  pointId: string;
  engineVersion: string;
  featureSchemaVersion?: string;
  state: AiRiskState;
  maturityState?: AiMaturityOutputState;
  dataQualityState?: AiDataQualityOutputState;
  severity: AiRiskSeverity;
  confidence: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
  signals: AiRiskSignal[];
  reasons: string[];
};

export type TechnicianRiskAssessment = {
  technicianId: string;
  engineVersion: string;
  featureSchemaVersion?: string;
  state: AiRiskState;
  maturityState?: AiMaturityOutputState;
  dataQualityState?: AiDataQualityOutputState;
  severity: AiRiskSeverity;
  confidence: TechnicianBaselineConfidence | 'UNKNOWN';
  signals: AiRiskSignal[];
  reasons: string[];
};
