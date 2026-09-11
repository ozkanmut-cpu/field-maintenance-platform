import { FeatureEntityType, FeatureSnapshot } from './feature-store.types';

export type ColdStartSource =
  | 'ENTITY_HISTORY'
  | 'REGION_TYPE_WEEK_COHORT'
  | 'REGION_TYPE_COHORT'
  | 'TYPE_WEEK_COHORT'
  | 'SIMILAR_REGION_COHORT'
  | 'TYPE_COHORT'
  | 'COMPANY_COHORT'
  | 'INSUFFICIENT';

export type ColdStartConfidence = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';

export type ColdStartEstimate = {
  entityType: Exclude<FeatureEntityType, 'SYSTEM'>;
  entityId: string;
  metric: string;
  value: number | null;
  source: ColdStartSource;
  confidence: ColdStartConfidence;
  sampleSize: number;
  entityCount: number;
  weeksUsed: number;
  reasons: string[];
};

export type ColdStartHistory = FeatureSnapshot[];
