export type FeatureEntityType = 'SYSTEM' | 'TECHNICIAN' | 'REGION' | 'POINT';

export type FeatureValue = string | number | boolean | null;

export type FeatureRecord = {
  entityType: FeatureEntityType;
  entityId: string;
  features: Record<string, FeatureValue>;
};

export type FeatureSnapshot = {
  weekKey: string;
  isoYear: number;
  isoWeek: number;
  weekStart: string;
  weekEnd: string;
  startInstant: string;
  endExclusiveInstant: string;
  sourceDataThrough: string | null;
  sourceHash: string;
  generatedAt: string;
  records: FeatureRecord[];
};

export interface FeatureSnapshotRepository {
  findBySourceHash(sourceHash: string): Promise<FeatureSnapshot | null>;
  save(snapshot: FeatureSnapshot): Promise<FeatureSnapshot>;
}
