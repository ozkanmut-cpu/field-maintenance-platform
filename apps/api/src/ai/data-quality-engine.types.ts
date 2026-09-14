export type DataQualitySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type DataQualityIssue = {
  code: string;
  severity: DataQualitySeverity;
  priority: number;
  entityType: 'POINT' | 'SYSTEM';
  entityId: string;
  evidence: Record<string, string | number | boolean | null>;
};

export type DataQualityAssessment = {
  engineVersion?: string;
  featureSchemaVersion?: string;
  score: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  maturityState: 'WARMING_UP' | 'ACTIVE';
  issues: DataQualityIssue[];
  reasonCodes: string[];
};
