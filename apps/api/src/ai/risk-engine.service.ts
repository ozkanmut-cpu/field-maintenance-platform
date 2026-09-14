import { Injectable } from '@nestjs/common';
import { CapabilityMaturity } from './data-maturity.types';
import { AI_ENGINE_VERSION } from './ai-version';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { AiRiskSeverity, AiRiskSignal, PointRiskAssessment, TechnicianRiskAssessment } from './risk-engine.types';
import { PointDifficultyProfile } from './point-difficulty.types';
import { TechnicianWeeklyBaseline } from './technician-baseline.types';
import { WeeklyWorkloadAssessment, WorkloadPressureBand } from './weekly-workload.types';

@Injectable()
export class RiskEngineService {
  assessTechnician(
    assigned: TechnicianAssignedWeeklyWorkload,
    baseline: TechnicianWeeklyBaseline,
    workload: WeeklyWorkloadAssessment,
    maturity?: CapabilityMaturity,
  ): TechnicianRiskAssessment {
    const reasons: string[] = [];
    const maturityReady = maturity?.state === 'ACTIVE' || maturity?.state === 'RELIABLE';
    if (!maturityReady) reasons.push('RISK_MATURITY_GATE_NOT_READY');
    if (baseline.state !== 'ACTIVE') reasons.push('TECHNICIAN_BASELINE_NOT_READY');

    const serviceValues = Object.values(workload.servicePressure);
    const travelValues = Object.values(workload.travelPressure);
    const pressureEvidenceKnown = serviceValues.some((value) => value !== 'UNKNOWN') || travelValues.some((value) => value !== 'UNKNOWN');
    if (!pressureEvidenceKnown) reasons.push('WORKLOAD_PRESSURE_UNKNOWN');

    if (reasons.length) {
      return {
        technicianId: assigned.technicianId,
        engineVersion: AI_ENGINE_VERSION,
        state: 'INSUFFICIENT_DATA',
        severity: 'UNKNOWN',
        confidence: 'UNKNOWN',
        signals: [],
        reasons,
      };
    }

    const signals: AiRiskSignal[] = [];
    const service = this.maxPressure(serviceValues);
    if (service === 'ABOVE_P90') signals.push({ code: 'SERVICE_LOAD_ABOVE_P90', severity: 'HIGH', evidence: { band: service } });
    else if (service === 'ABOVE_P75') signals.push({ code: 'SERVICE_LOAD_ABOVE_P75', severity: 'MEDIUM', evidence: { band: service } });

    const geo = workload.travelPressure.fieldP90RadiusMeters;
    if (geo === 'ABOVE_P90') signals.push({ code: 'GEOGRAPHIC_BURDEN_ABOVE_P90', severity: 'HIGH', evidence: { band: geo, assignedFieldP90RadiusMeters: assigned.assignedFieldP90RadiusMeters } });
    else if (geo === 'ABOVE_P75') signals.push({ code: 'GEOGRAPHIC_BURDEN_ABOVE_P75', severity: 'MEDIUM', evidence: { band: geo, assignedFieldP90RadiusMeters: assigned.assignedFieldP90RadiusMeters } });
    const route = workload.travelPressure.routeDistanceMeters;
    if (route === 'ABOVE_P90') signals.push({ code: 'ROUTE_BURDEN_ABOVE_P90', severity: 'HIGH', evidence: { band: route, assignedRouteEstimateMeters: assigned.assignedRouteEstimateMeters } });
    else if (route === 'ABOVE_P75') signals.push({ code: 'ROUTE_BURDEN_ABOVE_P75', severity: 'MEDIUM', evidence: { band: route, assignedRouteEstimateMeters: assigned.assignedRouteEstimateMeters } });
    const coherence = workload.travelPressure.routeCoherenceRatio;
    if (coherence === 'ABOVE_P90') signals.push({ code: 'ROUTE_COHERENCE_POOR', severity: 'HIGH', evidence: { band: coherence, ratio: assigned.assignedRouteCoherenceRatio } });
    else if (coherence === 'ABOVE_P75') signals.push({ code: 'ROUTE_COHERENCE_DEGRADED', severity: 'MEDIUM', evidence: { band: coherence, ratio: assigned.assignedRouteCoherenceRatio } });
    const fragmentation = workload.travelPressure.fragmentationRatio;
    if (fragmentation === 'ABOVE_P90') signals.push({ code: 'ROUTE_FRAGMENTATION_HIGH', severity: 'HIGH', evidence: { band: fragmentation, fragmentationRatio: assigned.assignedFragmentationRatio } });
    else if (fragmentation === 'ABOVE_P75') signals.push({ code: 'ROUTE_FRAGMENTATION_ELEVATED', severity: 'MEDIUM', evidence: { band: fragmentation, fragmentationRatio: assigned.assignedFragmentationRatio } });
    const workArea = workload.travelPressure.workAreaProximity;
    if (workArea === 'ABOVE_P90') signals.push({ code: 'WORK_AREA_DEVIATION_HIGH', severity: 'HIGH', evidence: { band: workArea, centerDistanceMeters: assigned.workAreaCenterDistanceMeters } });
    else if (workArea === 'ABOVE_P75') signals.push({ code: 'WORK_AREA_DEVIATION_ELEVATED', severity: 'MEDIUM', evidence: { band: workArea, centerDistanceMeters: assigned.workAreaCenterDistanceMeters } });

    const carryover = assigned.standardCarryover + assigned.smartcleanCarryover;
    if (carryover > 0) {
      const p75 = baseline.service.completedVisits.p75;
      signals.push({
        code: p75 !== null && carryover > p75 ? 'CARRYOVER_ABOVE_COMPLETION_P75' : 'CARRYOVER_PRESENT',
        severity: p75 !== null && carryover > p75 ? 'HIGH' : 'MEDIUM',
        evidence: { carryover, completionP75: p75 },
      });
    }

    const totalAssigned = assigned.standardCurrent + assigned.standardCarryover + assigned.smartcleanCurrent + assigned.smartcleanCarryover;
    const completionP75 = baseline.service.completedVisits.p75;
    const completionP90 = baseline.service.completedVisits.p90;
    const completionMedian = baseline.service.completedVisits.median;
    if (completionP90 !== null && totalAssigned > completionP90) {
      signals.push({ code: 'PERIOD_END_DELAY_RISK_HIGH', severity: 'HIGH', evidence: { totalAssigned, completionP90 } });
    } else if (completionP75 !== null && totalAssigned > completionP75) {
      signals.push({ code: 'PERIOD_END_DELAY_RISK_MEDIUM', severity: 'MEDIUM', evidence: { totalAssigned, completionP75 } });
    }
    if (completionP90 !== null && totalAssigned > completionP90) {
      signals.push({ code: 'TECHNICIAN_OVERLOAD', severity: 'HIGH', evidence: { totalAssigned, completionP90 } });
    } else if (completionMedian !== null && totalAssigned > 0 && totalAssigned < Math.max(1, completionMedian * 0.5)) {
      signals.push({ code: 'TECHNICIAN_UNDERLOAD', severity: 'LOW', evidence: { totalAssigned, completionMedian } });
    }
    if (assigned.smartcleanCarryover > 0) {
      signals.push({ code: 'SMARTCLEAN_WINDOW_OVERDUE', severity: 'HIGH', evidence: { smartcleanCarryover: assigned.smartcleanCarryover } });
    } else if (assigned.smartcleanCurrent > 0 && completionP75 !== null && totalAssigned > completionP75) {
      signals.push({ code: 'SMARTCLEAN_WINDOW_PRESSURE', severity: 'MEDIUM', evidence: { smartcleanCurrent: assigned.smartcleanCurrent, totalAssigned, completionP75 } });
    }

    const severity = signals.length ? this.maxSeverity(signals.map((signal) => signal.severity)) : 'LOW';
    const confidence = maturity?.state === 'RELIABLE' && baseline.confidence === 'HIGH' ? 'HIGH' : baseline.confidence === 'LOW' ? 'LOW' : 'MEDIUM';
    return {
      technicianId: assigned.technicianId,
      engineVersion: AI_ENGINE_VERSION,
      state: 'READY',
      severity,
      confidence,
      signals,
      reasons: signals.map((signal) => signal.code),
    };
  }


  assessPoint(profile: PointDifficultyProfile, maturity?: CapabilityMaturity): PointRiskAssessment {
    const reasons: string[] = [];
    const maturityReady = maturity?.state === 'ACTIVE' || maturity?.state === 'RELIABLE';
    if (!maturityReady) reasons.push('RISK_MATURITY_GATE_NOT_READY');
    if (profile.state !== 'ACTIVE') reasons.push('POINT_DIFFICULTY_NOT_READY');
    if (profile.equipmentProfile.confidence === 'UNKNOWN' || profile.equipmentProfile.confidence === 'LOW') reasons.push('POINT_EQUIPMENT_CONFIDENCE_LOW');
    if (reasons.length) return { pointId: profile.pointId, engineVersion: AI_ENGINE_VERSION, state: 'INSUFFICIENT_DATA', severity: 'UNKNOWN', confidence: 'UNKNOWN', signals: [], reasons };

    const signals: AiRiskSignal[] = [];
    if (profile.history.attempts > profile.history.visits && profile.history.attempts >= 2) {
      signals.push({ code: 'REPEATED_ATTEMPTS_DOMINATE_VISITS', severity: 'HIGH', evidence: { attempts: profile.history.attempts, visits: profile.history.visits } });
    } else if (profile.history.attempts > 0) {
      signals.push({ code: 'POINT_HAS_FAILED_ATTEMPTS', severity: 'MEDIUM', evidence: { attempts: profile.history.attempts, visits: profile.history.visits } });
    }
    if (profile.history.missed > 0) {
      signals.push({ code: 'POINT_HAS_MISSED_OBLIGATIONS', severity: profile.history.missed > profile.history.completed ? 'HIGH' : 'MEDIUM', evidence: { missed: profile.history.missed, completed: profile.history.completed } });
    }
    if (profile.equipmentProfile.anomalyCodes.length) {
      signals.push({ code: 'EQUIPMENT_PROFILE_UNSTABLE', severity: 'MEDIUM', evidence: { anomalyCount: profile.equipmentProfile.anomalyCodes.length } });
    }
    const severity = signals.length ? this.maxSeverity(signals.map((signal) => signal.severity)) : 'LOW';
    return { pointId: profile.pointId, engineVersion: AI_ENGINE_VERSION, state: 'READY', severity, confidence: profile.confidence, signals, reasons: signals.map((signal) => signal.code) };
  }

  private maxPressure(values: WorkloadPressureBand[]): WorkloadPressureBand {
    const rank: Record<WorkloadPressureBand, number> = { UNKNOWN: -1, WITHIN_BASELINE: 0, ABOVE_P75: 1, ABOVE_P90: 2 };
    return values.reduce((max, value) => rank[value] > rank[max] ? value : max, 'UNKNOWN');
  }

  private maxSeverity(values: Array<Exclude<AiRiskSeverity, 'UNKNOWN'>>): Exclude<AiRiskSeverity, 'UNKNOWN'> {
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
    return values.reduce((max, value) => rank[value] > rank[max] ? value : max, 'LOW');
  }
}
