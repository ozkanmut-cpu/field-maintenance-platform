import { Injectable } from '@nestjs/common';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { CapabilityMaturity } from './data-maturity.types';
import { PlanningAssessment, PlanningRecommendation, PlanningRecommendationType } from './planning-engine.types';
import { TechnicianRiskAssessment } from './risk-engine.types';
import { WeeklyWorkloadAssessment } from './weekly-workload.types';
import { DataQualityAssessment } from './data-quality-engine.types';
import { evaluateAiOutputPolicy } from './ai-output-policy';

export type PlanningTechnicianInput = {
  technicianId: string;
  assigned: TechnicianAssignedWeeklyWorkload;
  workload: WeeklyWorkloadAssessment;
  risk: TechnicianRiskAssessment;
};

@Injectable()
export class PlanningEngineService {
  assess(technicians: PlanningTechnicianInput[], maturity?: CapabilityMaturity, dataQuality?: DataQualityAssessment): PlanningAssessment {
    const policy = evaluateAiOutputPolicy(maturity, dataQuality);
    if (!policy.allowed) {
      return { engineVersion: AI_ENGINE_VERSION, featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION, state: 'INSUFFICIENT_DATA', maturityState: policy.maturityState, dataQualityState: policy.dataQualityState, confidence: 'UNKNOWN', recommendations: [], reasons: [...new Set([...policy.reasonCodes, 'RECOMMENDATION_MATURITY_OR_QUALITY_GATE_NOT_READY'])], reasonCodes: [...new Set([...policy.reasonCodes, 'RECOMMENDATION_MATURITY_OR_QUALITY_GATE_NOT_READY'])] };
    }

    const recommendations = technicians.flatMap((input) => this.forTechnician(input))
      .sort((a, b) => this.compareRank(a, b))
      .map((item, index) => ({ ...item, priority: Math.max(1, 100 - index), confidence: policy.confidenceCap === 'LOW' ? 'LOW' as const : item.confidence }));
    return { engineVersion: AI_ENGINE_VERSION, featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION, state: 'READY', maturityState: policy.maturityState, dataQualityState: policy.dataQualityState, confidence: policy.confidenceCap, recommendations, reasons: policy.reasonCodes, reasonCodes: policy.reasonCodes }; 
  }

  private forTechnician(input: PlanningTechnicianInput): PlanningRecommendation[] {
    const { assigned, workload, risk } = input;
    const result: PlanningRecommendation[] = [];
    const carryover = assigned.standardCarryover + assigned.smartcleanCarryover;
    if (carryover > 0) {
      result.push(this.recommend('PRIORITIZE_CARRYOVER', input, 0, ['CARRYOVER_PRESENT'], { carryover }));
    }

    if (risk.state === 'READY' && (risk.severity === 'HIGH' || risk.severity === 'MEDIUM')) {
      result.push(this.recommend('REVIEW_WORKLOAD_BALANCE', input, 0, risk.reasons, {
        standardCurrent: assigned.standardCurrent,
        smartcleanCurrent: assigned.smartcleanCurrent,
        carryover,
        totalEquipment: assigned.assignedCoolerCount + assigned.assignedTowerCount + assigned.assignedTapCount + assigned.assignedSmarttapCount,
        servicePressureRank: this.maxPressureRank(Object.values(workload.servicePressure)),
        travelPressureRank: this.maxPressureRank(Object.values(workload.travelPressure)),
        fragmentationRatio: assigned.assignedFragmentationRatio,
      }));
    }

    const route = workload.travelPressure.routeDistanceMeters;
    const radius = workload.travelPressure.fieldP90RadiusMeters;
    const travelPressureRank = this.maxPressureRank(Object.values(workload.travelPressure));
    if (travelPressureRank >= 1) {
      result.push(this.recommend('REVIEW_ROUTE', input, 0, ['TRAVEL_PRESSURE_HIGH'], {
        routeBand: route, radiusBand: radius, travelPressureRank,
        routeEstimateMeters: assigned.assignedRouteEstimateMeters,
        routeCoherenceRatio: assigned.assignedRouteCoherenceRatio,
        fragmentationRatio: assigned.assignedFragmentationRatio,
        workAreaCenterDistanceMeters: assigned.workAreaCenterDistanceMeters,
      }));
    }

    if (assigned.equipmentUnknownPointCount > 0 || assigned.assignedUnlocatedPointCount > 0) {
      result.push(this.recommend('FIX_DATA_QUALITY', input, 0, ['ASSIGNED_DATA_QUALITY_INCOMPLETE'], {
        equipmentUnknownPointCount: assigned.equipmentUnknownPointCount,
        unlocatedPointCount: assigned.assignedUnlocatedPointCount,
      }));
    }
    return result;
  }

  private compareRank(a: PlanningRecommendation, b: PlanningRecommendation) {
    const av = this.rankVector(a), bv = this.rankVector(b);
    for (let i = 0; i < av.length; i += 1) if (av[i] !== bv[i]) return bv[i] - av[i];
    return a.technicianId.localeCompare(b.technicianId) || a.type.localeCompare(b.type);
  }

  private rankVector(item: PlanningRecommendation) {
    const severity = { UNKNOWN: 0, LOW: 1, MEDIUM: 2, HIGH: 3 }[item.severity];
    const type = { REVIEW_WORKLOAD_BALANCE: 4, PRIORITIZE_CARRYOVER: 3, REVIEW_ROUTE: 2, FIX_DATA_QUALITY: 1 }[item.type];
    const service = Number(item.evidence.servicePressureRank ?? 0);
    const travel = Number(item.evidence.travelPressureRank ?? 0);
    const carryover = Number(item.evidence.carryover ?? 0);
    const equipment = Number(item.evidence.totalEquipment ?? 0);
    return [severity, Math.max(service, travel), type, carryover, equipment];
  }

  private maxPressureRank(values: Array<'UNKNOWN' | 'WITHIN_BASELINE' | 'ABOVE_P75' | 'ABOVE_P90'>) {
    const rank = { UNKNOWN: 0, WITHIN_BASELINE: 0, ABOVE_P75: 1, ABOVE_P90: 2 } as const;
    return values.reduce((max, value) => Math.max(max, rank[value]), 0);
  }

  private recommend(type: PlanningRecommendationType, input: PlanningTechnicianInput, priority: number, reasonCodes: string[], evidence: PlanningRecommendation['evidence']): PlanningRecommendation {
    return {
      id: `${input.technicianId}:${type}`,
      type,
      technicianId: input.technicianId,
      priority,
      severity: input.risk.severity,
      confidence: input.risk.confidence,
      titleCode: `PLANNING_${type}`,
      reasonCodes: [...new Set(reasonCodes)],
      evidence,
      constraints: ['NO_AUTOMATIC_OPERATIONAL_CHANGE', 'PRESERVE_ASSIGNMENT_AND_BUSINESS_RULES'],
    };
  }
}
