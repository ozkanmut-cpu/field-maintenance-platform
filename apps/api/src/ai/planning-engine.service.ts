import { Injectable } from '@nestjs/common';
import { AI_ENGINE_VERSION } from './ai-version';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { CapabilityMaturity } from './data-maturity.types';
import { PlanningAssessment, PlanningRecommendation, PlanningRecommendationType } from './planning-engine.types';
import { TechnicianRiskAssessment } from './risk-engine.types';
import { WeeklyWorkloadAssessment } from './weekly-workload.types';

export type PlanningTechnicianInput = {
  technicianId: string;
  assigned: TechnicianAssignedWeeklyWorkload;
  workload: WeeklyWorkloadAssessment;
  risk: TechnicianRiskAssessment;
};

@Injectable()
export class PlanningEngineService {
  assess(technicians: PlanningTechnicianInput[], maturity?: CapabilityMaturity): PlanningAssessment {
    if (maturity?.state !== 'ACTIVE' && maturity?.state !== 'RELIABLE') {
      return { engineVersion: AI_ENGINE_VERSION, state: 'INSUFFICIENT_DATA', recommendations: [], reasons: ['RECOMMENDATION_MATURITY_GATE_NOT_READY'] };
    }

    const recommendations = technicians.flatMap((input) => this.forTechnician(input))
      .sort((a, b) => b.priority - a.priority || a.technicianId.localeCompare(b.technicianId) || a.type.localeCompare(b.type));
    return { engineVersion: AI_ENGINE_VERSION, state: 'READY', recommendations, reasons: [] };
  }

  private forTechnician(input: PlanningTechnicianInput): PlanningRecommendation[] {
    const { assigned, workload, risk } = input;
    const result: PlanningRecommendation[] = [];
    const carryover = assigned.standardCarryover + assigned.smartcleanCarryover;
    if (carryover > 0) {
      result.push(this.recommend('PRIORITIZE_CARRYOVER', input, carryover >= 3 ? 90 : 70, ['CARRYOVER_PRESENT'], { carryover }));
    }

    if (risk.state === 'READY' && (risk.severity === 'HIGH' || risk.severity === 'MEDIUM')) {
      result.push(this.recommend('REVIEW_WORKLOAD_BALANCE', input, risk.severity === 'HIGH' ? 95 : 75, risk.reasons, {
        standardCurrent: assigned.standardCurrent,
        smartcleanCurrent: assigned.smartcleanCurrent,
      }));
    }

    const route = workload.travelPressure.routeDistanceMeters;
    const radius = workload.travelPressure.fieldP90RadiusMeters;
    if (route === 'ABOVE_P90' || route === 'ABOVE_P75' || radius === 'ABOVE_P90' || radius === 'ABOVE_P75') {
      result.push(this.recommend('REVIEW_ROUTE', input, route === 'ABOVE_P90' || radius === 'ABOVE_P90' ? 85 : 65, ['TRAVEL_PRESSURE_HIGH'], {
        routeBand: route,
        radiusBand: radius,
        routeEstimateMeters: assigned.assignedRouteEstimateMeters,
        fieldP90RadiusMeters: assigned.assignedFieldP90RadiusMeters,
      }));
    }

    if (assigned.equipmentUnknownPointCount > 0 || assigned.assignedUnlocatedPointCount > 0) {
      result.push(this.recommend('FIX_DATA_QUALITY', input, 60, ['ASSIGNED_DATA_QUALITY_INCOMPLETE'], {
        equipmentUnknownPointCount: assigned.equipmentUnknownPointCount,
        unlocatedPointCount: assigned.assignedUnlocatedPointCount,
      }));
    }
    return result;
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
