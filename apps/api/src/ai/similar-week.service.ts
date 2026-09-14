import { Injectable } from '@nestjs/common';
import { FeatureSnapshot } from './feature-store.types';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';

export type SimilarWeekMatch = {
  engineVersion?: string;
  featureSchemaVersion?: string;
  weekKey: string;
  similarity: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  dimensionsUsed: number;
  reasons: string[];
};

@Injectable()
export class SimilarWeekService {
  find(history: FeatureSnapshot[], targetWeekKey?: string, limit = 5): SimilarWeekMatch[] {
    const ordered = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    const target = targetWeekKey ? ordered.find((s) => s.weekKey === targetWeekKey) : ordered.at(-1);
    if (!target) return [];
    const targetVector = this.vector(target);
    return ordered
      .filter((candidate) => candidate.weekKey !== target.weekKey)
      .map((candidate) => this.compare(targetVector, candidate))
      .filter((match) => match.dimensionsUsed >= 3)
      .sort((a, b) => b.similarity - a.similarity || b.weekKey.localeCompare(a.weekKey))
      .slice(0, Math.max(1, Math.min(12, limit)));
  }

  private compare(target: Record<string, number | null>, candidate: FeatureSnapshot): SimilarWeekMatch {
    const vector = this.vector(candidate);
    const deltas: Array<{ key: string; delta: number }> = [];
    for (const key of Object.keys(target).sort()) {
      const a = target[key], b = vector[key];
      if (a === null || b === null) continue;
      const scale = Math.max(1, Math.abs(a), Math.abs(b));
      deltas.push({ key, delta: Math.min(1, Math.abs(a - b) / scale) });
    }
    const distance = deltas.length ? deltas.reduce((sum, item) => sum + item.delta, 0) / deltas.length : 1;
    const similarity = Math.round((1 - distance) * 1000) / 10;
    const closest = [...deltas].sort((a, b) => a.delta - b.delta || a.key.localeCompare(b.key)).slice(0, 3).map((item) => `SIMILAR_${item.key.toUpperCase()}`);
    const confidence = deltas.length >= 9 ? 'HIGH' : deltas.length >= 6 ? 'MEDIUM' : 'LOW';
    return { engineVersion: AI_ENGINE_VERSION, featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION, weekKey: candidate.weekKey, similarity, confidence, dimensionsUsed: deltas.length, reasons: closest };
  }

  private vector(snapshot: FeatureSnapshot): Record<string, number | null> {
    const system = snapshot.records.find((r) => r.entityType === 'SYSTEM')?.features ?? {};
    const technicians = snapshot.records.filter((r) => r.entityType === 'TECHNICIAN');
    const sum = (key: string) => technicians.reduce((total, record) => total + this.number(record.features[key]), 0);
    return {
      workloadVisits: this.optional(system.visitCount),
      workloadAttempts: this.optional(system.attemptCount),
      smartcleanCurrent: this.optional(system.smartcleanCurrentWorkloadCount),
      smartcleanCarryover: this.optional(system.smartcleanCarryoverWorkloadCount),
      coolerMix: sum('servicedCoolerCount'),
      towerMix: sum('servicedTowerCount'),
      tapMix: sum('servicedTapCount'),
      smarttapMix: sum('servicedSmarttapCount'),
      geographicFragmentation: this.optional(system.geographicFragmentationRatio),
      geographicLargestClusterShare: this.optional(system.geographicLargestClusterShare),
      routeDistance: technicians.some((r) => typeof r.features.fieldRouteDistanceMeters === 'number') ? sum('fieldRouteDistanceMeters') : null,
    };
  }

  private optional(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
  private number(value: unknown) { return this.optional(value) ?? 0; }
}
