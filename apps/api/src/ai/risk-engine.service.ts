import { Injectable } from '@nestjs/common';
import { CapabilityMaturity } from './data-maturity.types';
import { AI_ENGINE_VERSION } from './ai-version';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { AiRiskSeverity, AiRiskSignal, TechnicianRiskAssessment } from './risk-engine.types';
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
    const pressureEvidenceKnown = serviceValues.some((value) => value !== 'UNKNOWN') || workload.travelPressure.fieldP90RadiusMeters !== 'UNKNOWN';
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

    const carryover = assigned.standardCarryover + assigned.smartcleanCarryover;
    if (carryover > 0) {
      const p75 = baseline.service.completedVisits.p75;
      signals.push({
        code: p75 !== null && carryover > p75 ? 'CARRYOVER_ABOVE_COMPLETION_P75' : 'CARRYOVER_PRESENT',
        severity: p75 !== null && carryover > p75 ? 'HIGH' : 'MEDIUM',
        evidence: { carryover, completionP75: p75 },
      });
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

  private maxPressure(values: WorkloadPressureBand[]): WorkloadPressureBand {
    const rank: Record<WorkloadPressureBand, number> = { UNKNOWN: -1, WITHIN_BASELINE: 0, ABOVE_P75: 1, ABOVE_P90: 2 };
    return values.reduce((max, value) => rank[value] > rank[max] ? value : max, 'UNKNOWN');
  }

  private maxSeverity(values: Array<Exclude<AiRiskSeverity, 'UNKNOWN'>>): Exclude<AiRiskSeverity, 'UNKNOWN'> {
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
    return values.reduce((max, value) => rank[value] > rank[max] ? value : max, 'LOW');
  }
}
