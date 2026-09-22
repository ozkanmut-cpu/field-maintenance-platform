import { Injectable } from '@nestjs/common';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import { PlanningRecommendation } from './planning-engine.types';
import { TechnicianRiskAssessment, PointRiskAssessment } from './risk-engine.types';

type Observation = {
  risk: Record<string, number>;
  recommendation: Record<string, number>;
};

@Injectable()
export class AiDistributionDriftService {
  private readonly observations: Observation[] = [];

  observe(
    risks: Array<TechnicianRiskAssessment | PointRiskAssessment>,
    recommendations: PlanningRecommendation[],
  ) {
    this.observations.push({
      risk: this.shares(risks.map((item) => item.severity)),
      recommendation: this.shares(recommendations.map((item) => item.type)),
    });
    if (this.observations.length > 50) this.observations.splice(0, this.observations.length - 50);
  }

  snapshot() {
    const count = this.observations.length;
    if (count < 4) return this.empty(count);
    const split = Math.floor(count / 2);
    const previous = this.average(this.observations.slice(0, split));
    const recent = this.average(this.observations.slice(split));
    const risk = this.delta(previous.risk, recent.risk);
    const recommendation = this.delta(previous.recommendation, recent.recommendation);
    const maxDelta = Math.max(0, ...Object.values(risk).map(Math.abs), ...Object.values(recommendation).map(Math.abs));
    const state = maxDelta >= 0.25 ? 'DRIFT' : maxDelta >= 0.1 ? 'WATCH' : 'STABLE';
    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      observationCount: count,
      state,
      maxAbsoluteDelta: this.round(maxDelta),
      risk,
      recommendation,
      reasonCodes: state === 'DRIFT' ? ['AI_OUTPUT_DISTRIBUTION_DRIFT_DETECTED']
        : state === 'WATCH' ? ['AI_OUTPUT_DISTRIBUTION_DRIFT_WATCH'] : ['AI_OUTPUT_DISTRIBUTION_STABLE'],
    };
  }

  private shares(values: string[]) {
    if (!values.length) return {};
    const counts: Record<string, number> = {};
    for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / values.length]));
  }

  private average(rows: Observation[]) {
    return { risk: this.averageMap(rows.map((row) => row.risk)), recommendation: this.averageMap(rows.map((row) => row.recommendation)) };
  }
  private averageMap(rows: Array<Record<string, number>>) {
    const keys = new Set(rows.flatMap((row) => Object.keys(row)));
    return Object.fromEntries([...keys].sort().map((key) => [key, rows.length ? rows.reduce((sum, row) => sum + (row[key] ?? 0), 0) / rows.length : 0]));
  }

  private delta(previous: Record<string, number>, recent: Record<string, number>) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(recent)]);
    return Object.fromEntries([...keys].sort().map((key) => [key, this.round((recent[key] ?? 0) - (previous[key] ?? 0))]));
  }

  private empty(count: number) {
    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      observationCount: count,
      state: 'UNKNOWN' as const,
      maxAbsoluteDelta: null,
      risk: {},
      recommendation: {},
      reasonCodes: ['AI_OUTPUT_DISTRIBUTION_HISTORY_SHORT'],
    };
  }

  private round(value: number) { return Math.round(value * 1000) / 1000; }
}
