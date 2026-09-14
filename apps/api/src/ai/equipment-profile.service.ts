import { Injectable } from '@nestjs/common';
import { FeatureSnapshot } from './feature-store.types';
import { EquipmentProfileAssessment, EquipmentProfileConfidence, EquipmentProfileStability } from './equipment-profile.types';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';

type EquipmentVector = [number, number, number, number];

@Injectable()
export class EquipmentProfileService {
  assessPoint(history: FeatureSnapshot[], pointId: string): EquipmentProfileAssessment {
    const rows = [...history]
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((snapshot) => snapshot.records.find((r) => r.entityType === 'POINT' && r.entityId === pointId)?.features)
      .filter((row): row is Record<string, string | number | boolean | null> => Boolean(row));
    const latest = rows.at(-1) ?? {};
    const complete = latest.equipmentProfileComplete === true;
    const verifiedVisitCount = rows.reduce((sum, row) => sum + this.number(row.equipmentConfirmedVisitCount), 0);
    const lastVerifiedAt = this.latestString(rows.map((row) => row.equipmentVerifiedAt));
    const verificationAgeDays = this.optionalNumber(latest.equipmentVerificationAgeDays);
    const vectors = rows.map((row) => this.snapshotVector(row)).filter((v): v is EquipmentVector => Boolean(v));
    const changeCount = vectors.slice(1).reduce((sum, vector, index) => sum + (this.sameVector(vector, vectors[index]) ? 0 : 1), 0);
    const changeRate = vectors.length >= 2 ? changeCount / (vectors.length - 1) : null;
    const anomalyCodes = this.anomalies(vectors);
    const stability = this.stability(vectors, changeRate, anomalyCodes);
    const confidenceScore = this.confidenceScore({ complete, verifiedVisitCount, verificationAgeDays, stability });
    const confidence = this.confidence(confidenceScore, complete);
    const reasons: string[] = [];
    if (!complete) reasons.push('EQUIPMENT_PROFILE_INCOMPLETE');
    if (verifiedVisitCount === 0) reasons.push('EQUIPMENT_NEVER_CONFIRMED_IN_VISIT_HISTORY');
    if (verificationAgeDays === null) reasons.push('EQUIPMENT_VERIFICATION_AGE_UNKNOWN');
    else if (verificationAgeDays > 90) reasons.push('EQUIPMENT_VERIFICATION_STALE');
    if (vectors.length < 2) reasons.push('EQUIPMENT_STABILITY_HISTORY_SHORT');
    reasons.push(...anomalyCodes);
    const uniqueReasons = [...new Set(reasons)];
    return {
      engineVersion: AI_ENGINE_VERSION, featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      maturityState: confidence === 'UNKNOWN' || confidence === 'LOW' ? 'WARMING_UP' : 'ACTIVE',
      pointId, confidence, confidenceScore, complete, verifiedVisitCount, lastVerifiedAt, verificationAgeDays,
      observedSnapshotCount: vectors.length, changeCount, changeRate: changeRate === null ? null : Number(changeRate.toFixed(4)),
      stability, anomalyCodes, reasons: uniqueReasons, reasonCodes: uniqueReasons,
    };
  }

  private snapshotVector(row: Record<string, string | number | boolean | null>): EquipmentVector | null {
    const values = ['equipmentSnapshotCoolerCount', 'equipmentSnapshotTowerCount', 'equipmentSnapshotTapCount', 'equipmentSnapshotSmarttapCount']
      .map((key) => this.optionalNumber(row[key]));
    return values.every((value) => value !== null) ? values as EquipmentVector : null;
  }

  private anomalies(vectors: EquipmentVector[]) {
    const codes: string[] = [];
    if (vectors.length >= 3) {
      for (let i = 2; i < vectors.length; i += 1) {
        if (this.sameVector(vectors[i], vectors[i - 2]) && !this.sameVector(vectors[i], vectors[i - 1])) {
          codes.push('EQUIPMENT_PROFILE_OSCILLATION'); break;
        }
      }
    }
    const transitions = vectors.slice(1).filter((vector, i) => !this.sameVector(vector, vectors[i])).length;
    if (vectors.length >= 4 && transitions >= 2) codes.push('REPEATED_EQUIPMENT_CHANGES');
    return codes;
  }

  private stability(vectors: EquipmentVector[], changeRate: number | null, anomalies: string[]): EquipmentProfileStability {
    if (vectors.length < 2 || changeRate === null) return 'UNKNOWN';
    if (anomalies.includes('EQUIPMENT_PROFILE_OSCILLATION') || changeRate > 0.5) return 'VOLATILE';
    if (changeRate > 0) return 'CHANGING';
    return 'STABLE';
  }

  private confidenceScore(input: { complete: boolean; verifiedVisitCount: number; verificationAgeDays: number | null; stability: EquipmentProfileStability }) {
    if (!input.complete) return 0;
    let score = 40;
    score += Math.min(30, input.verifiedVisitCount * 10);
    if (input.verificationAgeDays !== null) {
      if (input.verificationAgeDays <= 30) score += 20;
      else if (input.verificationAgeDays <= 90) score += 10;
    }
    if (input.stability === 'STABLE') score += 10;
    else if (input.stability === 'CHANGING') score += 5;
    return Math.max(0, Math.min(100, score));
  }

  private confidence(score: number, complete: boolean): EquipmentProfileConfidence {
    if (!complete) return 'UNKNOWN';
    if (score >= 80) return 'HIGH';
    if (score >= 60) return 'MEDIUM';
    return 'LOW';
  }

  private sameVector(a: EquipmentVector, b: EquipmentVector) { return a.every((value, i) => value === b[i]); }
  private latestString(values: Array<string | number | boolean | null | undefined>) { return [...values].reverse().find((v): v is string => typeof v === 'string' && v.length > 0) ?? null; }
  private optionalNumber(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
  private number(value: unknown) { return this.optionalNumber(value) ?? 0; }
}
