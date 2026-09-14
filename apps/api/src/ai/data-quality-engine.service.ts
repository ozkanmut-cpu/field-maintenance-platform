import { Injectable } from '@nestjs/common';
import { EquipmentProfileService } from './equipment-profile.service';
import { FeatureSnapshot } from './feature-store.types';
import { LocationIntelligenceService } from './location-intelligence.service';
import { DataQualityAssessment, DataQualityIssue, DataQualitySeverity } from './data-quality-engine.types';

@Injectable()
export class DataQualityEngineService {
  constructor(
    private readonly equipmentProfiles: EquipmentProfileService,
    private readonly locations: LocationIntelligenceService,
  ) {}

  assess(history: FeatureSnapshot[]): DataQualityAssessment {
    if (!history.length) return { score: 0, confidence: 'LOW', issues: [], reasonCodes: ['NO_SNAPSHOTS'] };
    const ordered = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    const latest = ordered.at(-1)!;
    const issues: DataQualityIssue[] = [];
    const locationByPoint = new Map(this.locations.assess(ordered).map((x) => [x.pointId, x]));
    const pointIds = new Set(latest.records.filter((r) => r.entityType === 'POINT').map((r) => r.entityId));
    const equipmentByPoint = new Map([...pointIds].map((id) => [id, this.equipmentProfiles.assessPoint(ordered, id)]));

    for (const row of latest.records.filter((r) => r.entityType === 'POINT')) {
      const f = row.features;
      const location = locationByPoint.get(row.entityId);
      const equipment = equipmentByPoint.get(row.entityId);
      if (f.hasRegion !== true) this.add(issues, 'REGION_MISSING', 'HIGH', row.entityId, {});
      if (f.hasCanonicalLocation !== true) this.add(issues, 'LOCATION_MISSING', 'HIGH', row.entityId, {});
      if (location?.state === 'CONTRADICTORY') this.add(issues, 'LOCATION_CONTRADICTION', 'CRITICAL', row.entityId, { contradictionCount: location.contradictionCount });
      if (typeof f.locationConfidence === 'number' && f.hasCanonicalLocation === true && f.locationConfidence < 50) this.add(issues, 'LOCATION_CONFIDENCE_LOW', 'MEDIUM', row.entityId, { locationConfidence: f.locationConfidence });
      if (equipment && !equipment.complete) this.add(issues, 'EQUIPMENT_PROFILE_INCOMPLETE', 'HIGH', row.entityId, {});
      const verificationAgeDays = equipment?.verificationAgeDays ?? null;
      if (verificationAgeDays !== null && verificationAgeDays > 90) this.add(issues, 'EQUIPMENT_PROFILE_STALE', 'MEDIUM', row.entityId, { verificationAgeDays });
      if (equipment?.anomalyCodes.length) this.add(issues, 'EQUIPMENT_CHANGE_ANOMALY', 'HIGH', row.entityId, { anomalyCount: equipment.anomalyCodes.length });
      if (f.maintenanceType === 'SMARTCLEAN' && f.maintenanceWeek !== 1 && f.maintenanceWeek !== 2) this.add(issues, 'SMARTCLEAN_RUT_WEEK_INVALID', 'CRITICAL', row.entityId, { maintenanceWeek: this.scalar(f.maintenanceWeek) });
      if ((this.num(f.suspiciousVisitCount) ?? 0) > 0) this.add(issues, 'SUSPICIOUS_VISIT_EVIDENCE', 'HIGH', row.entityId, { count: this.num(f.suspiciousVisitCount) ?? 0 });
      if ((this.num(f.reviewRecommendedVisitCount) ?? 0) > 0) this.add(issues, 'REVIEW_RECOMMENDED_VISIT', 'MEDIUM', row.entityId, { count: this.num(f.reviewRecommendedVisitCount) ?? 0 });
    }

    issues.sort((a, b) => b.priority - a.priority || a.entityId.localeCompare(b.entityId) || a.code.localeCompare(b.code));
    const pointCount = latest.records.filter((r) => r.entityType === 'POINT').length;
    const penalty = issues.reduce((sum, issue) => sum + ({ LOW: 2, MEDIUM: 5, HIGH: 10, CRITICAL: 20 }[issue.severity]), 0);
    const score = pointCount ? Math.max(0, Math.round(100 - penalty / pointCount)) : 0;
    const confidence = ordered.length >= 8 ? 'HIGH' : ordered.length >= 4 ? 'MEDIUM' : 'LOW';
    return { score, confidence, issues, reasonCodes: [...new Set(issues.map((x) => x.code))] };
  }

  private add(issues: DataQualityIssue[], code: string, severity: DataQualitySeverity, entityId: string, evidence: DataQualityIssue['evidence']) {
    const priority = { LOW: 20, MEDIUM: 50, HIGH: 75, CRITICAL: 100 }[severity];
    issues.push({ code, severity, priority, entityType: 'POINT', entityId, evidence });
  }

  private num(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
  private scalar(value: unknown): string | number | boolean | null { return ['string','number','boolean'].includes(typeof value) ? value as string | number | boolean : null; }
}
