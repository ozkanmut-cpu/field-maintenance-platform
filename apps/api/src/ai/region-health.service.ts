import { Injectable } from '@nestjs/common';
import { FeatureSnapshot } from './feature-store.types';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';

export type RegionHealth = {
  regionId: string;
  engineVersion: string;
  featureSchemaVersion?: string;
  score: number;
  state: 'GREEN' | 'AMBER' | 'RED';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  maturityState: 'WARMING_UP' | 'ACTIVE';
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING' | 'UNKNOWN';
  reasonCodes: string[];
  evidence: Record<string, string | number | boolean | null>;
};

@Injectable()
export class RegionHealthService {
  assess(history: FeatureSnapshot[]): RegionHealth[] {
    const ordered = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    const latest = ordered.at(-1);
    if (!latest) return [];
    const previous = ordered.at(-2);
    return latest.records.filter((r) => r.entityType === 'REGION').map((row) => {
      const prev = previous?.records.find((r) => r.entityType === 'REGION' && r.entityId === row.entityId)?.features;
      const currentScore = this.score(row.features);
      const previousScore = prev ? this.score(prev) : null;
      const points = this.num(row.features.pointCount);
      const reasons = this.reasons(row.features);
      const confidence = points >= 20 && ordered.length >= 8 ? 'HIGH' : points >= 5 && ordered.length >= 4 ? 'MEDIUM' : 'LOW';
      return {
        regionId: row.entityId,
        engineVersion: AI_ENGINE_VERSION,
        featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
        score: currentScore,
        state: currentScore >= 80 ? 'GREEN' : currentScore >= 55 ? 'AMBER' : 'RED',
        confidence,
        maturityState: confidence === 'LOW' ? 'WARMING_UP' : 'ACTIVE',
        trend: previousScore === null ? 'UNKNOWN' : currentScore >= previousScore + 5 ? 'IMPROVING' : currentScore <= previousScore - 5 ? 'WORSENING' : 'STABLE',
        reasonCodes: reasons,
        evidence: {
          pointCount: points,
          locationCoverage: this.num(row.features.locationCoverage),
          attemptCount: this.num(row.features.attemptCount),
          visitCount: this.num(row.features.visitCount),
          smartcleanCarryover: this.num(row.features.smartcleanCarryoverWorkloadCount),
          fragmentationRatio: this.num(row.features.geographicFragmentationRatio),
        },
      } satisfies RegionHealth;
    }).sort((a, b) => a.score - b.score || a.regionId.localeCompare(b.regionId));
  }
  private score(f: Record<string, any>) {
    let score = 100;
    const coverage = this.num(f.locationCoverage);
    const visits = this.num(f.visitCount);
    const attempts = this.num(f.attemptCount);
    const carryover = this.num(f.smartcleanCarryoverWorkloadCount);
    const fragmentation = this.num(f.geographicFragmentationRatio);
    if (coverage < 0.5) score -= 25; else if (coverage < 0.8) score -= 10;
    const attemptRate = visits + attempts > 0 ? attempts / (visits + attempts) : 0;
    if (attemptRate > 0.3) score -= 25; else if (attemptRate > 0.15) score -= 10;
    if (carryover > 0) score -= Math.min(30, 10 + carryover * 5);
    if (fragmentation > 0.5) score -= 15; else if (fragmentation > 0.3) score -= 5;
    return Math.max(0, Math.round(score));
  }

  private reasons(f: Record<string, any>) {
    const reasons: string[] = [];
    const coverage = this.num(f.locationCoverage);
    const visits = this.num(f.visitCount);
    const attempts = this.num(f.attemptCount);
    const attemptRate = visits + attempts > 0 ? attempts / (visits + attempts) : 0;
    if (coverage < 0.5) reasons.push('REGION_LOCATION_COVERAGE_LOW');
    if (attemptRate > 0.3) reasons.push('REGION_ATTEMPT_RATE_HIGH');
    if (this.num(f.smartcleanCarryoverWorkloadCount) > 0) reasons.push('REGION_SMARTCLEAN_CARRYOVER');
    if (this.num(f.geographicFragmentationRatio) > 0.5) reasons.push('REGION_ROUTE_FRAGMENTATION_HIGH');
    if (!reasons.length) reasons.push('REGION_HEALTH_WITHIN_RULE_BANDS');
    return reasons;
  }

  private num(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }
}
