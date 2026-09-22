import { Injectable } from '@nestjs/common';
import { FeatureSnapshot } from './feature-store.types';

export type DifficultyCalibrationFactor = {
  code: string;
  bucket: 'LOW' | 'HIGH' | 'FALSE' | 'TRUE';
  threshold: number | null;
  rate: number;
  evidence: number;
};

export type DifficultyCalibrationResult = {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence: number;
  effectiveEvidence: number;
  estimatedRate: number | null;
  factors: DifficultyCalibrationFactor[];
  reasonCodes: string[];
};

type Row = {
  pointId: string;
  coolerCount: number;
  towerCount: number;
  tapCount: number;
  smarttapCount: number;
  nearestNeighborMeters: number | null;
  isolated: boolean;
  adverse: number;
  total: number;
};
@Injectable()
export class DifficultyCalibrationService {
  estimate(history: FeatureSnapshot[], pointId: string): DifficultyCalibrationResult {
    const rows = this.rows(history);
    const target = [...rows].reverse().find((row) => row.pointId === pointId);
    const totalEvidence = rows.reduce((sum, row) => sum + row.total, 0);
    const confidence = totalEvidence >= 80 ? 'HIGH' : totalEvidence >= 24 ? 'MEDIUM' : 'LOW';
    if (!target || totalEvidence < 8) {
      return { confidence, evidence: totalEvidence, effectiveEvidence: 0, estimatedRate: null, factors: [], reasonCodes: ['DIFFICULTY_CALIBRATION_EVIDENCE_LOW'] };
    }

    const factors: DifficultyCalibrationFactor[] = [];
    this.numericFactor(rows, target, 'coolerCount', 'COOLER_LOAD', factors);
    this.numericFactor(rows, target, 'towerCount', 'TOWER_LOAD', factors);
    this.numericFactor(rows, target, 'tapCount', 'TAP_LOAD', factors);
    this.numericFactor(rows, target, 'smarttapCount', 'SMARTTAP_LOAD', factors);
    this.numericFactor(rows, target, 'nearestNeighborMeters', 'GEOGRAPHIC_SEPARATION', factors);
    this.booleanFactor(rows, target, 'isolated', 'GEOGRAPHIC_ISOLATION', factors);

    if (!factors.length) {
      return { confidence, evidence: totalEvidence, effectiveEvidence: 0, estimatedRate: null, factors, reasonCodes: ['DIFFICULTY_CALIBRATION_BUCKETS_EMPTY'] };
    }
    const weight = factors.reduce((sum, factor) => sum + factor.evidence / factors.length, 0);
    const estimatedRate = weight > 0
      ? factors.reduce((sum, factor) => sum + factor.rate * (factor.evidence / factors.length), 0) / weight
      : null;
    return {
      confidence,
      evidence: totalEvidence,
      effectiveEvidence: Number(weight.toFixed(2)),
      estimatedRate: estimatedRate === null ? null : Number(estimatedRate.toFixed(4)),
      factors,
      reasonCodes: factors.map((factor) => `CALIBRATED_${factor.code}_${factor.bucket}`),
    };
  }
  private rows(history: FeatureSnapshot[]): Row[] {
    const result: Row[] = [];
    for (const snapshot of history) {
      for (const record of snapshot.records) {
        if (record.entityType !== 'POINT') continue;
        const f = record.features;
        const counts = [f.coolerCount, f.towerCount, f.tapCount, f.smarttapCount];
        if (!counts.every((value) => typeof value === 'number' && Number.isFinite(value))) continue;
        const visits = this.number(f.visitCount);
        const attempts = this.number(f.attemptCount);
        const missed = this.number(f.missedObligationCount);
        const completed = this.number(f.completedObligationCount);
        const adverse = attempts + missed;
        const total = visits + attempts + missed + completed;
        if (total <= 0) continue;
        result.push({
          pointId: record.entityId,
          coolerCount: Number(f.coolerCount),
          towerCount: Number(f.towerCount),
          tapCount: Number(f.tapCount),
          smarttapCount: Number(f.smarttapCount),
          nearestNeighborMeters: this.optionalNumber(f.nearestNeighborMeters),
          isolated: f.geographicIsolated === true,
          adverse,
          total,
        });
      }
    }
    return result;
  }

  private numericFactor(
    rows: Row[], target: Row,
    key: 'coolerCount' | 'towerCount' | 'tapCount' | 'smarttapCount' | 'nearestNeighborMeters',
    code: string, out: DifficultyCalibrationFactor[],
  ) {
    const usable = rows.filter((row) => row[key] !== null) as Array<Row & Record<typeof key, number>>;
    if (usable.length < 4) return;
    const sorted = usable.map((row) => row[key]).sort((a, b) => a - b);
    const threshold = this.percentile(sorted, 0.5);
    const value = target[key];
    if (value === null || threshold === null) return;
    const high = value > threshold;
    const bucket = usable.filter((row) => high ? row[key] > threshold : row[key] <= threshold);
    this.pushRate(out, code, high ? 'HIGH' : 'LOW', threshold, bucket);
  }
  private booleanFactor(
    rows: Row[], target: Row, key: 'isolated', code: string, out: DifficultyCalibrationFactor[],
  ) {
    const bucket = rows.filter((row) => row[key] === target[key]);
    this.pushRate(out, code, target[key] ? 'TRUE' : 'FALSE', null, bucket);
  }

  private pushRate(
    out: DifficultyCalibrationFactor[], code: string,
    bucket: DifficultyCalibrationFactor['bucket'], threshold: number | null, rows: Row[],
  ) {
    const evidence = rows.reduce((sum, row) => sum + row.total, 0);
    if (evidence < 4) return;
    const adverse = rows.reduce((sum, row) => sum + row.adverse, 0);
    out.push({ code, bucket, threshold, rate: Number((adverse / evidence).toFixed(4)), evidence });
  }

  private percentile(sorted: number[], p: number) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  }

  private optionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private number(value: unknown) {
    return this.optionalNumber(value) ?? 0;
  }
}
