import { Injectable } from '@nestjs/common';
import { DataMaturityService } from './data-maturity.service';
import { DataQualityEngineService } from './data-quality-engine.service';
import { FeatureSnapshot } from './feature-store.types';
import { PointDifficultyService } from './point-difficulty.service';
import { RegionHealthService } from './region-health.service';
import { TechnicianBaselineService } from './technician-baseline.service';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';

export type AiTrendAssessment = {
  engineVersion?: string;
  featureSchemaVersion?: string;
  maturityState: 'WARMING_UP' | 'ACTIVE';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reasonCodes: string[];
  weekly: Array<{ weekKey: string; maturityScore: number; dataQualityScore: number; locationCoverage: number; equipmentCoverage: number }>;
  regions: Array<{ regionId: string; currentScore: number; trend: string }>;
  technicians: Array<{ technicianId: string; currentCapacityP75: number | null; previousCapacityP75: number | null; delta: number | null }>;
  points: Array<{ pointId: string; currentDifficulty: number | null; previousDifficulty: number | null; delta: number | null }>;
};

@Injectable()
export class TrendService {
  constructor(
    private readonly maturity: DataMaturityService,
    private readonly dataQuality: DataQualityEngineService,
    private readonly regions: RegionHealthService,
    private readonly baselines: TechnicianBaselineService,
    private readonly difficulties: PointDifficultyService,
  ) {}
  assess(history: FeatureSnapshot[]): AiTrendAssessment {
    const ordered = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey));
    const weekly = ordered.map((_, index) => {
      const prefix = ordered.slice(0, index + 1);
      const maturity = this.maturity.assess(prefix);
      const quality = this.dataQuality.assess(prefix);
      return {
        weekKey: ordered[index].weekKey,
        maturityScore: maturity.overallScore,
        dataQualityScore: quality.score,
        locationCoverage: maturity.evidence.locationCoverage,
        equipmentCoverage: maturity.evidence.equipmentProfileCoverage,
      };
    });

    const regionRows = this.regions.assess(ordered);
    const regions = regionRows.map((row) => ({ regionId: row.regionId, currentScore: row.score, trend: row.trend }));
    const technicianIds = new Set(ordered.flatMap((s) => s.records.filter((r) => r.entityType === 'TECHNICIAN').map((r) => r.entityId)));
    const technicians = [...technicianIds].sort().map((technicianId) => {
      const current = this.baselines.assessTechnician(ordered, technicianId).service.completedVisits.p75;
      const previous = ordered.length > 1 ? this.baselines.assessTechnician(ordered.slice(0, -1), technicianId).service.completedVisits.p75 : null;
      return { technicianId, currentCapacityP75: current, previousCapacityP75: previous, delta: this.delta(current, previous) };
    });
    const currentDifficultyByPoint = new Map(this.difficulties.assess(ordered).map((row) => [row.pointId, row.score]));
    const previousDifficultyByPoint = ordered.length > 1
      ? new Map(this.difficulties.assess(ordered.slice(0, -1)).map((row) => [row.pointId, row.score]))
      : new Map<string, number | null>();
    const pointIds = new Set([...currentDifficultyByPoint.keys(), ...previousDifficultyByPoint.keys()]);
    const points = [...pointIds].sort().map((pointId) => {
      const current = currentDifficultyByPoint.get(pointId) ?? null;
      const previous = previousDifficultyByPoint.get(pointId) ?? null;
      return { pointId, currentDifficulty: current, previousDifficulty: previous, delta: this.delta(current, previous) };
    });

    const confidence = ordered.length >= 8 ? 'HIGH' : ordered.length >= 4 ? 'MEDIUM' : 'LOW';
    const reasonCodes = ordered.length >= 2 ? ['HISTORICAL_TREND_AVAILABLE'] : ['HISTORICAL_TREND_HISTORY_SHORT'];
    return { engineVersion: AI_ENGINE_VERSION, featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION, maturityState: confidence === 'LOW' ? 'WARMING_UP' : 'ACTIVE', confidence, reasonCodes, weekly, regions, technicians, points };
  }

  private delta(current: number | null, previous: number | null) {
    if (current === null || previous === null) return null;
    return Math.round((current - previous) * 1000) / 1000;
  }
}
