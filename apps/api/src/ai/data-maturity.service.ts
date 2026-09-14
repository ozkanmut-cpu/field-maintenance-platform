import { Injectable } from '@nestjs/common';
import { FeatureSnapshot } from './feature-store.types';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import {
  AiCapability,
  AiMaturityState,
  CapabilityMaturity,
  DataMaturityAssessment,
  MaturityEvidence,
  SnapshotHistory,
} from './data-maturity.types';

@Injectable()
export class DataMaturityService {
  assess(history: SnapshotHistory): DataMaturityAssessment {
    const snapshots = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    const evidence = this.collectEvidence(snapshots);
    const capabilities = this.evaluateCapabilities(evidence);
    const overallScore = capabilities.length
      ? Math.round(capabilities.reduce((sum, item) => sum + item.score, 0) / capabilities.length)
      : 0;

    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      latestWeekKey: snapshots.at(-1)?.weekKey ?? null,
      overallState: this.stateForScore(overallScore),
      overallScore,
      confidence: overallScore >= 75 ? 'HIGH' : overallScore >= 45 ? 'MEDIUM' : 'LOW',
      reasonCodes: [...new Set(capabilities.flatMap((item) => item.reasons))],
      evidence,
      capabilities,
    };
  }

  private collectEvidence(snapshots: FeatureSnapshot[]): MaturityEvidence {
    let visits = 0;
    let attempts = 0;
    let suspiciousVisits = 0;
    let reviewRecommended = 0;

    for (const snapshot of snapshots) {
      const system = snapshot.records.find((record) => record.entityType === 'SYSTEM')?.features ?? {};
      visits += this.number(system.visitCount);
      attempts += this.number(system.attemptCount);
      for (const record of snapshot.records) {
        if (record.entityType !== 'TECHNICIAN') continue;
        suspiciousVisits += this.number(record.features.suspiciousVisitCount);
        reviewRecommended += this.number(record.features.reviewRecommendedCount);
      }
    }

    const latest = snapshots.at(-1)?.records.find((record) => record.entityType === 'SYSTEM')?.features ?? {};
    const activePoints = this.number(latest.activePointCount);
    const locatedPoints = this.number(latest.locatedPointCount);
    const activeTechnicians = this.number(latest.activeTechnicianCount);
    const regions = this.number(latest.regionCount);
    const completeEquipment = this.number(latest.equipmentProfileCompleteCount);
    const locationCoverage = activePoints > 0 ? locatedPoints / activePoints : 0;
    const storedEquipmentCoverage = this.optionalNumber(latest.equipmentProfileCoverage);
    const equipmentProfileCoverage = storedEquipmentCoverage ?? (activePoints > 0 ? completeEquipment / activePoints : 0);

    return {
      weeks: snapshots.length,
      visits,
      attempts,
      activePoints,
      locatedPoints,
      activeTechnicians,
      regions,
      suspiciousVisits,
      reviewRecommended,
      locationCoverage: Number(locationCoverage.toFixed(4)),
      equipmentProfileCoverage: Number(Math.max(0, Math.min(1, equipmentProfileCoverage)).toFixed(4)),
    };
  }

  private evaluateCapabilities(e: MaturityEvidence): CapabilityMaturity[] {
    return [
      this.capability('CORE', this.scoreCore(e), 100, e),
      this.capability('GEOGRAPHY', this.scoreGeography(e), this.geoQuality(e), e),
      this.capability('CAPACITY', this.scoreCapacity(e), Math.min(this.historyQuality(e), this.equipmentQuality(e)), e),
      this.capability('RISK', this.scoreRisk(e), Math.min(this.historyQuality(e), this.equipmentQuality(e), this.geoQuality(e)), e),
      this.capability('ANOMALY', this.scoreAnomaly(e), this.anomalyQuality(e), e),
      this.capability('RECOMMENDATION', this.scoreRecommendation(e), this.recommendationQuality(e), e),
      this.capability('SEASONALITY', this.scoreSeasonality(e), this.historyQuality(e), e),
    ];
  }

  private capability(
    capability: AiCapability,
    rawScore: number,
    qualityScore: number,
    e: MaturityEvidence,
  ): CapabilityMaturity {
    const score = Math.max(0, Math.min(100, Math.round(rawScore * (qualityScore / 100))));
    return {
      capability,
      state: this.stateForScore(score),
      score,
      qualityScore: Math.round(qualityScore),
      reasons: this.reasons(capability, e),
    };
  }

  private scoreCore(e: MaturityEvidence) {
    return this.progress(e.activePoints, 20, 100) * 25 +
      this.progress(e.activeTechnicians, 2, 8) * 25 +
      this.progress(e.weeks, 1, 4) * 20 +
      this.progress(e.visits + e.attempts, 10, 100) * 30;
  }

  private scoreGeography(e: MaturityEvidence) {
    return this.progress(e.locationCoverage, 0.25, 0.9) * 55 +
      this.progress(e.visits, 20, 300) * 25 +
      this.progress(e.weeks, 2, 8) * 20;
  }

  private scoreCapacity(e: MaturityEvidence) {
    return this.progress(e.weeks, 3, 12) * 50 +
      this.progress(e.visits, 50, 500) * 35 +
      this.progress(e.activeTechnicians, 2, 6) * 15;
  }

  private scoreRisk(e: MaturityEvidence) {
    return this.progress(e.weeks, 4, 16) * 45 +
      this.progress(e.visits + e.attempts, 100, 800) * 35 +
      this.progress(e.attempts, 5, 80) * 20;
  }

  private scoreAnomaly(e: MaturityEvidence) {
    return this.progress(e.weeks, 2, 10) * 35 +
      this.progress(e.visits, 80, 800) * 45 +
      this.progress(e.suspiciousVisits + e.reviewRecommended, 2, 40) * 20;
  }

  private scoreRecommendation(e: MaturityEvidence) {
    return this.progress(e.weeks, 6, 16) * 35 +
      this.progress(e.visits, 200, 1000) * 30 +
      this.progress(e.locationCoverage, 0.5, 0.9) * 20 +
      this.progress(e.activeTechnicians, 3, 8) * 15;
  }

  private scoreSeasonality(e: MaturityEvidence) {
    return this.progress(e.weeks, 16, 52) * 70 +
      this.progress(e.visits, 500, 3000) * 30;
  }

  private geoQuality(e: MaturityEvidence) {
    if (e.activePoints === 0) return 0;
    return Math.min(100, 35 + e.locationCoverage * 65);
  }

  private historyQuality(e: MaturityEvidence) {
    if (e.weeks === 0 || e.visits + e.attempts === 0) return 0;
    return Math.min(100, 40 + this.progress(e.weeks, 1, 12) * 35 + this.progress(e.visits, 1, 500) * 25);
  }

  private anomalyQuality(e: MaturityEvidence) {
    if (e.visits === 0) return 0;
    return Math.min(100, 50 + this.progress(e.visits, 1, 500) * 35 + this.progress(e.weeks, 1, 8) * 15);
  }

  private equipmentQuality(e: MaturityEvidence) {
    if (e.activePoints === 0) return 0;
    return Math.min(100, 30 + e.equipmentProfileCoverage * 70);
  }

  private recommendationQuality(e: MaturityEvidence) {
    return Math.min(this.geoQuality(e), this.historyQuality(e), this.equipmentQuality(e));
  }

  private reasons(capability: AiCapability, e: MaturityEvidence) {
    const reasons: string[] = [];
    if (e.weeks === 0) reasons.push('Henüz haftalık snapshot yok');
    if (e.visits === 0) reasons.push('Henüz geçerli bakım ziyareti yok');
    if (e.activePoints === 0) reasons.push('Aktif nokta verisi yok');
    if (capability === 'GEOGRAPHY' || capability === 'RISK' || capability === 'RECOMMENDATION') {
      if (e.locationCoverage < 0.5) reasons.push('Konum kapsaması %50 altında');
    }
    if (capability === 'CAPACITY' || capability === 'RISK' || capability === 'RECOMMENDATION') {
      if (e.equipmentProfileCoverage < 0.5) reasons.push('Ekipman profil kapsaması %50 altında');
    }
    if (capability === 'CAPACITY' && e.weeks < 3) reasons.push('Kapasite baseline için en az 3 hafta gerekli');
    if (capability === 'RISK' && e.weeks < 4) reasons.push('Risk modeli için en az 4 hafta gerekli');
    if (capability === 'SEASONALITY' && e.weeks < 16) reasons.push('Sezon analizi için en az 16 hafta gerekli');
    if (reasons.length === 0) reasons.push('Veri gereksinimleri yeterli seviyede');
    return reasons;
  }

  private stateForScore(score: number): AiMaturityState {
    if (score < 20) return 'INACTIVE';
    if (score < 50) return 'WARMING_UP';
    if (score < 80) return 'ACTIVE';
    return 'RELIABLE';
  }

  private progress(value: number, start: number, full: number) {
    if (value <= start) return 0;
    if (value >= full) return 1;
    return (value - start) / (full - start);
  }

  private optionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private number(value: unknown) {
    return this.optionalNumber(value) ?? 0;
  }
}
