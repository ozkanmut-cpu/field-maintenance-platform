import { Injectable } from '@nestjs/common';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import { PlanningAssessment } from './planning-engine.types';
import { RegionHealth } from './region-health.service';
import { TechnicianRiskAssessment } from './risk-engine.types';

export type SummaryTechnicianInput = {
  technicianId: string;
  name: string;
  currentWork: number;
  carryover: number;
  risk: TechnicianRiskAssessment;
  suspiciousVisits: number;
  paperworkPending: number;
};

export type AiSummary = {
  engineVersion: string;
  featureSchemaVersion: string;
  scope: 'TECHNICIAN_DAILY' | 'ADMIN_DAILY' | 'PERIOD';
  entityId: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  headlineCode: string;
  reasonCodes: string[];
  metrics: Record<string, string | number | boolean | null>;
};
@Injectable()
export class AiSummaryService {
  technicianDaily(input: SummaryTechnicianInput): AiSummary {
    const reasons = [...input.risk.reasons];
    if (input.carryover > 0) reasons.push('CARRYOVER_PRESENT');
    if (input.suspiciousVisits > 0) reasons.push('SUSPICIOUS_VISIT_REVIEW_NEEDED');
    if (input.paperworkPending > 0) reasons.push('PAPERWORK_BACKLOG_PRESENT');
    const headlineCode = input.risk.severity === 'HIGH'
      ? 'TECHNICIAN_DAY_HIGH_ATTENTION'
      : input.risk.severity === 'MEDIUM' || reasons.length
        ? 'TECHNICIAN_DAY_REVIEW'
        : 'TECHNICIAN_DAY_NORMAL';
    return this.summary('TECHNICIAN_DAILY', input.technicianId, headlineCode, input.risk.confidence, reasons, {
      technicianName: input.name,
      currentWork: input.currentWork,
      carryover: input.carryover,
      riskSeverity: input.risk.severity,
      suspiciousVisits: input.suspiciousVisits,
      paperworkPending: input.paperworkPending,
    });
  }
  adminDaily(
    technicians: SummaryTechnicianInput[],
    regions: RegionHealth[],
    planning: PlanningAssessment,
  ): AiSummary {
    const highRisk = technicians.filter((item) => item.risk.severity === 'HIGH').length;
    const carryover = technicians.reduce((sum, item) => sum + item.carryover, 0);
    const redRegions = regions.filter((item) => item.state === 'RED').length;
    const reasons: string[] = [];
    if (highRisk > 0) reasons.push('HIGH_RISK_TECHNICIANS_PRESENT');
    if (carryover > 0) reasons.push('CARRYOVER_PRESENT');
    if (redRegions > 0) reasons.push('RED_REGIONS_PRESENT');
    if (planning.recommendations.length > 0) reasons.push('PLANNING_RECOMMENDATIONS_PRESENT');
    const headline = highRisk || redRegions ? 'ADMIN_DAY_HIGH_ATTENTION' : reasons.length ? 'ADMIN_DAY_REVIEW' : 'ADMIN_DAY_NORMAL';
    return this.summary('ADMIN_DAILY', 'SYSTEM', headline, this.aggregateConfidence(technicians), reasons, {
      technicianCount: technicians.length,
      highRiskTechnicianCount: highRisk,
      carryoverCount: carryover,
      redRegionCount: redRegions,
      recommendationCount: planning.recommendations.length,
    });
  }
  period(
    weekKey: string | null,
    technicians: SummaryTechnicianInput[],
    regions: RegionHealth[],
  ): AiSummary {
    const carryover = technicians.reduce((sum, item) => sum + item.carryover, 0);
    const highRisk = technicians.filter((item) => item.risk.severity === 'HIGH').length;
    const amberOrRed = regions.filter((item) => item.state !== 'GREEN').length;
    const reasons: string[] = [];
    if (carryover > 0) reasons.push('PERIOD_CARRYOVER_REMAINS');
    if (highRisk > 0) reasons.push('PERIOD_HIGH_RISK_TECHNICIANS');
    if (amberOrRed > 0) reasons.push('PERIOD_REGION_HEALTH_NOT_GREEN');
    const headline = reasons.length ? 'PERIOD_REVIEW_REQUIRED' : 'PERIOD_HEALTHY';
    return this.summary('PERIOD', weekKey ?? 'UNKNOWN', headline, this.aggregateConfidence(technicians), reasons, {
      weekKey,
      carryoverCount: carryover,
      highRiskTechnicianCount: highRisk,
      nonGreenRegionCount: amberOrRed,
    });
  }

  private aggregateConfidence(items: SummaryTechnicianInput[]): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (!items.length) return 'LOW';
    const values = items.map((item) => item.risk.confidence);
    if (values.every((value) => value === 'HIGH')) return 'HIGH';
    if (values.some((value) => value === 'UNKNOWN' || value === 'LOW')) return 'LOW';
    return 'MEDIUM';
  }
  private summary(
    scope: AiSummary['scope'],
    entityId: string,
    headlineCode: string,
    confidence: string,
    reasonCodes: string[],
    metrics: AiSummary['metrics'],
  ): AiSummary {
    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      scope,
      entityId,
      confidence: confidence === 'HIGH' ? 'HIGH' : confidence === 'MEDIUM' ? 'MEDIUM' : 'LOW',
      headlineCode,
      reasonCodes: [...new Set(reasonCodes)],
      metrics,
    };
  }
}
