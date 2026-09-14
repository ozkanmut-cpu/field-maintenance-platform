import { Injectable } from '@nestjs/common';
import { DataMaturityService } from './data-maturity.service';
import { FeatureSnapshot } from './feature-store.types';
import { PointDifficultyService } from './point-difficulty.service';
import { RiskEngineService } from './risk-engine.service';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';

export type BacktestResult = {
  engineVersion: string;
  featureSchemaVersion?: string;
  state: 'INSUFFICIENT_DATA' | 'READY';
  evaluatedPredictions: number;
  skippedPredictions: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  precision: number | null;
  recall: number | null;
  accuracy: number | null;
  reasonCodes: string[];
};

@Injectable()
export class BacktestService {
  constructor(
    private readonly maturity: DataMaturityService,
    private readonly difficulties: PointDifficultyService,
    private readonly risks: RiskEngineService,
  ) {}

  evaluate(history: FeatureSnapshot[]): BacktestResult {
    const ordered = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    let tp = 0, fp = 0, tn = 0, fn = 0, skipped = 0;
    for (let i = 3; i < ordered.length - 1; i += 1) {
      const prefix = ordered.slice(0, i + 1);
      const next = ordered[i + 1];
      const riskMaturity = this.maturity.assess(prefix).capabilities.find((x) => x.capability === 'RISK');
      const nextByPoint = new Map(next.records.filter((r) => r.entityType === 'POINT').map((r) => [r.entityId, r.features]));
      for (const profile of this.difficulties.assess(prefix)) {
        const nextFeatures = nextByPoint.get(profile.pointId);
        if (!nextFeatures) continue;
        const risk = this.risks.assessPoint(profile, riskMaturity);
        if (risk.state !== 'READY') { skipped += 1; continue; }
        const predicted = risk.severity === 'MEDIUM' || risk.severity === 'HIGH';
        const actual = this.number(nextFeatures.attemptCount) > 0 || this.number(nextFeatures.missedObligationCount) > 0;
        if (predicted && actual) tp += 1;
        else if (predicted) fp += 1;
        else if (actual) fn += 1;
        else tn += 1;
      }
    }
    const evaluated = tp + fp + tn + fn;
    const precision = tp + fp ? tp / (tp + fp) : null;
    const recall = tp + fn ? tp / (tp + fn) : null;
    const accuracy = evaluated ? (tp + tn) / evaluated : null;
    const reasonCodes: string[] = [];
    if (ordered.length < 5) reasonCodes.push('BACKTEST_HISTORY_TOO_SHORT');
    if (!evaluated) reasonCodes.push('NO_EVALUABLE_PREDICTIONS');
    if (skipped) reasonCodes.push('SOME_PREDICTIONS_SKIPPED_BY_MATURITY_GATE');
    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      state: evaluated ? 'READY' : 'INSUFFICIENT_DATA',
      evaluatedPredictions: evaluated,
      skippedPredictions: skipped,
      truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn,
      precision: this.round(precision), recall: this.round(recall), accuracy: this.round(accuracy), reasonCodes,
    };
  }

  private number(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
  private round(value: number | null) { return value === null ? null : Math.round(value * 1000) / 1000; }
}
