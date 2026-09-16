import { Injectable } from '@nestjs/common';
import { GeographyService } from './geography.service';
import { FeatureSnapshot } from './feature-store.types';
import { AiLocationAssessment } from './location-intelligence.types';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';

@Injectable()
export class LocationIntelligenceService {
  constructor(private readonly geography: GeographyService) {}

  assess(history: FeatureSnapshot[]): AiLocationAssessment[] {
    const ordered = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    const ids = new Set(ordered.flatMap((s) => s.records.filter((r) => r.entityType === 'POINT').map((r) => r.entityId)));
    return [...ids].sort().map((id) => this.assessPoint(ordered, id));
  }

  assessPoint(history: FeatureSnapshot[], pointId: string): AiLocationAssessment {
    const rows = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey))
      .flatMap((s) => s.records.filter((r) => r.entityType === 'POINT' && r.entityId === pointId));
    const latest = rows.at(-1)?.features ?? {};
    const hasLocation = latest.hasCanonicalLocation === true;
    const storedConfidence = this.num(latest.locationConfidence) ?? 0;
    const evidenceVisits = rows.reduce((sum, row) => sum + (this.num(row.features.locationEvidenceVisitCount) ?? 0), 0);
    const reasonCodes: string[] = [];
    let contradictionCount = 0;

    const coords = rows.map((row) => ({
      latitude: this.num(row.features.canonicalLatitude),
      longitude: this.num(row.features.canonicalLongitude),
    })).filter((x): x is { latitude: number; longitude: number } => x.latitude !== null && x.longitude !== null);
    for (let i = 1; i < coords.length; i += 1) {
      if (this.geography.distanceMeters(coords[i - 1], coords[i]) > 250) contradictionCount += 1;
    }

    const visitDistance = this.num(latest.locationVisitToCanonicalMeters);
    if (visitDistance !== null && visitDistance > 250) contradictionCount += 1;
    if (!hasLocation) reasonCodes.push('CANONICAL_LOCATION_MISSING');
    if (storedConfidence < 50 && hasLocation) reasonCodes.push('LOCATION_CONFIDENCE_LOW');
    if (evidenceVisits < 2) reasonCodes.push('LOCATION_EVIDENCE_SHALLOW');
    if (contradictionCount > 0) reasonCodes.push('LOCATION_CONTRADICTION');

    let score = hasLocation ? Math.min(70, storedConfidence * 0.7) : 0;
    score += Math.min(25, evidenceVisits * 5);
    score -= contradictionCount * 35;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const state = contradictionCount > 0 ? 'CONTRADICTORY' : !hasLocation ? 'UNKNOWN' : score >= 80 ? 'STRONG' : score >= 50 ? 'SUPPORTED' : 'WEAK';
    const confidence = score >= 80 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
    return { engineVersion: AI_ENGINE_VERSION, featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION, pointId, state, confidenceScore: score, confidence, maturityState: confidence === 'LOW' || state === 'UNKNOWN' ? 'WARMING_UP' : 'ACTIVE', evidenceVisits, contradictionCount, reasonCodes };
  }

  private num(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
}
