import { Injectable } from '@nestjs/common';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import { FeatureSnapshot } from './feature-store.types';

export type CalibrationImpact = {
  code: string;
  lowRate: number | null;
  highRate: number | null;
  relativeImpact: number | null;
  evidence: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type CalibrationDrift = {
  code: string;
  previousImpact: number | null;
  recentImpact: number | null;
  delta: number | null;
  state: 'UNKNOWN' | 'STABLE' | 'WATCH' | 'DRIFT';
};

export type WorkloadCalibrationAssessment = {
  engineVersion: string;
  featureSchemaVersion: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  maturityState: 'WARMING_UP' | 'ACTIVE';
  equipment: CalibrationImpact[];
  equipmentReference: { coolerCount: number | null; towerCount: number | null; tapCount: number | null; smarttapCount: number | null };
  travel: CalibrationImpact[];
  drift: CalibrationDrift[];
  reasonCodes: string[];
};
type CalibrationRow = {
  cooler: number;
  tower: number;
  tap: number;
  smarttap: number;
  separation: number | null;
  isolated: boolean;
  adverse: number;
  total: number;
};

@Injectable()
export class WorkloadCalibrationService {
  assess(history: FeatureSnapshot[]): WorkloadCalibrationAssessment {
    const ordered = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    const rows = this.rows(ordered);
    const equipment = [
      this.numericImpact(rows, 'cooler', 'COOLER_RELATIVE_WORKLOAD'),
      this.numericImpact(rows, 'tower', 'TOWER_RELATIVE_WORKLOAD'),
      this.numericImpact(rows, 'tap', 'TAP_RELATIVE_WORKLOAD'),
      this.numericImpact(rows, 'smarttap', 'SMARTTAP_RELATIVE_WORKLOAD'),
    ];
    const equipmentReference = {
      coolerCount: this.median(rows.map((row) => row.cooler)),
      towerCount: this.median(rows.map((row) => row.tower)),
      tapCount: this.median(rows.map((row) => row.tap)),
      smarttapCount: this.median(rows.map((row) => row.smarttap)),
    };
    const travel = [
      this.numericImpact(rows, 'separation', 'GEOGRAPHIC_SEPARATION_BURDEN'),
      this.booleanImpact(rows, 'isolated', 'GEOGRAPHIC_ISOLATION_BURDEN'),
    ];
    const midpoint = Math.floor(ordered.length / 2);
    const previous = this.rows(ordered.slice(0, midpoint));
    const recent = this.rows(ordered.slice(midpoint));
    const definitions: Array<[keyof Pick<CalibrationRow, 'cooler' | 'tower' | 'tap' | 'smarttap' | 'separation'>, string]> = [
      ['cooler', 'COOLER_RELATIVE_WORKLOAD'],
      ['tower', 'TOWER_RELATIVE_WORKLOAD'],
      ['tap', 'TAP_RELATIVE_WORKLOAD'],
      ['smarttap', 'SMARTTAP_RELATIVE_WORKLOAD'],
      ['separation', 'GEOGRAPHIC_SEPARATION_BURDEN'],
    ];
    const drift = definitions.map(([key, code]) => this.driftFor(code,
      this.numericImpact(previous, key, code), this.numericImpact(recent, key, code)));
    drift.push(this.driftFor('GEOGRAPHIC_ISOLATION_BURDEN',
      this.booleanImpact(previous, 'isolated', 'GEOGRAPHIC_ISOLATION_BURDEN'),
      this.booleanImpact(recent, 'isolated', 'GEOGRAPHIC_ISOLATION_BURDEN')));
    const evidence = rows.reduce((sum, row) => sum + row.total, 0);
    const confidence = evidence >= 120 ? 'HIGH' : evidence >= 40 ? 'MEDIUM' : 'LOW';
    const reasonCodes: string[] = [];
    if (evidence < 40) reasonCodes.push('CALIBRATION_EVIDENCE_LOW');
    if (drift.some((item) => item.state === 'DRIFT')) reasonCodes.push('CALIBRATION_DRIFT_DETECTED');
    if (!reasonCodes.length) reasonCodes.push('CALIBRATION_WITHIN_STABLE_BANDS');
    return { engineVersion: AI_ENGINE_VERSION, featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION, confidence, maturityState: confidence === 'LOW' ? 'WARMING_UP' : 'ACTIVE', equipment, equipmentReference, travel, drift, reasonCodes };
  }

  private rows(history: FeatureSnapshot[]): CalibrationRow[] {
    return history.flatMap((snapshot) => snapshot.records.flatMap((record) => {
      if (record.entityType !== 'POINT') return [];
      const f = record.features;
      const counts = [f.coolerCount, f.towerCount, f.tapCount, f.smarttapCount];
      if (!counts.every((value) => typeof value === 'number' && Number.isFinite(value))) return [];
      const visits = this.num(f.visitCount), attempts = this.num(f.attemptCount);
      const missed = this.num(f.missedObligationCount), completed = this.num(f.completedObligationCount);
      const total = visits + attempts + missed + completed;
      if (total <= 0) return [];
      return [{ cooler: Number(f.coolerCount), tower: Number(f.towerCount), tap: Number(f.tapCount), smarttap: Number(f.smarttapCount),
        separation: this.optional(f.nearestNeighborMeters), isolated: f.geographicIsolated === true, adverse: attempts + missed, total }];
    }));
  }
  private numericImpact(rows: CalibrationRow[], key: 'cooler' | 'tower' | 'tap' | 'smarttap' | 'separation', code: string): CalibrationImpact {
    const usable = rows.filter((row) => row[key] !== null) as Array<CalibrationRow & Record<typeof key, number>>;
    if (usable.length < 4) return this.emptyImpact(code, usable.reduce((sum, row) => sum + row.total, 0));
    const values = usable.map((row) => row[key]).sort((a, b) => a - b);
    const threshold = this.percentile(values, 0.5);
    if (threshold === null) return this.emptyImpact(code, 0);
    return this.impact(code, usable.filter((row) => row[key] <= threshold), usable.filter((row) => row[key] > threshold));
  }

  private booleanImpact(rows: CalibrationRow[], key: 'isolated', code: string): CalibrationImpact {
    return this.impact(code, rows.filter((row) => row[key] === false), rows.filter((row) => row[key] === true));
  }

  private impact(code: string, low: CalibrationRow[], high: CalibrationRow[]): CalibrationImpact {
    const lowEvidence = low.reduce((sum, row) => sum + row.total, 0);
    const highEvidence = high.reduce((sum, row) => sum + row.total, 0);
    const evidence = lowEvidence + highEvidence;
    if (lowEvidence < 4 || highEvidence < 4) return this.emptyImpact(code, evidence);
    const lowRate = low.reduce((sum, row) => sum + row.adverse, 0) / lowEvidence;
    const highRate = high.reduce((sum, row) => sum + row.adverse, 0) / highEvidence;
    return { code, lowRate: this.round(lowRate), highRate: this.round(highRate), relativeImpact: this.round(highRate - lowRate), evidence,
      confidence: evidence >= 80 ? 'HIGH' : evidence >= 24 ? 'MEDIUM' : 'LOW' };
  }

  private driftFor(code: string, previous: CalibrationImpact, recent: CalibrationImpact): CalibrationDrift {
    if (previous.relativeImpact === null || recent.relativeImpact === null) return { code, previousImpact: previous.relativeImpact, recentImpact: recent.relativeImpact, delta: null, state: 'UNKNOWN' };
    const delta = this.round(recent.relativeImpact - previous.relativeImpact)!;
    const magnitude = Math.abs(delta);
    return { code, previousImpact: previous.relativeImpact, recentImpact: recent.relativeImpact, delta,
      state: magnitude >= 0.15 ? 'DRIFT' : magnitude >= 0.08 ? 'WATCH' : 'STABLE' };
  }
  private emptyImpact(code: string, evidence: number): CalibrationImpact {
    return { code, lowRate: null, highRate: null, relativeImpact: null, evidence, confidence: 'LOW' };
  }

  private percentile(sorted: number[], p: number) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const lo = Math.floor(index), hi = Math.ceil(index);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  }

  private median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    return this.percentile(sorted, 0.5);
  }

  private optional(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
  private num(value: unknown) { return this.optional(value) ?? 0; }
  private round(value: number | null) { return value === null ? null : Math.round(value * 10000) / 10000; }
}
