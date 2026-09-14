import { Injectable } from '@nestjs/common';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { CapabilityMaturity } from './data-maturity.types';
import { RiskEngineService } from './risk-engine.service';
import { TechnicianWeeklyBaseline } from './technician-baseline.types';
import { WeeklyWorkloadService } from './weekly-workload.service';
import { DataQualityAssessment } from './data-quality-engine.types';
import { estimateServiceEffort } from './service-effort';


export type RegionWorkloadVector = {
  regionId: string;
  standardCurrent: number;
  standardCarryover: number;
  smartcleanCurrent: number;
  smartcleanCarryover: number;
  equipmentKnownPointCount: number;
  equipmentUnknownPointCount: number;
  coolerCount: number;
  towerCount: number;
  tapCount: number;
  smarttapCount: number;
  locatedPointCount: number;
  unlocatedPointCount: number;
  p90RadiusMeters: number | null;
  fragmentationRatio: number | null;
};

export type WhatIfChange = Partial<{
  standardCurrentDelta: number;
  standardCarryoverDelta: number;
  smartcleanCurrentDelta: number;
  smartcleanCarryoverDelta: number;
  coolerDelta: number;
  towerDelta: number;
  tapDelta: number;
  smarttapDelta: number;
  equipmentUnknownPointDelta: number;
  locatedPointDelta: number;
  unlocatedPointDelta: number;
  routeEstimateMeters: number;
  fieldP90RadiusMeters: number;
}>;

@Injectable()
export class WhatIfService {
  constructor(private readonly workloadEngine: WeeklyWorkloadService, private readonly riskEngine: RiskEngineService) {}

  simulate(assigned: TechnicianAssignedWeeklyWorkload, baseline: TechnicianWeeklyBaseline, riskMaturity: CapabilityMaturity | undefined, change: WhatIfChange, dataQuality?: DataQualityAssessment) {
    const beforeWorkload = this.workloadEngine.assess(assigned, baseline);
    const beforeRisk = this.riskEngine.assessTechnician(assigned, baseline, beforeWorkload, riskMaturity, dataQuality);
    const after = this.apply(assigned, change);
    const afterWorkload = this.workloadEngine.assess(after, baseline);
    const afterRisk = this.riskEngine.assessTechnician(after, baseline, afterWorkload, riskMaturity, dataQuality);
    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      technicianId: assigned.technicianId,
      change,
      before: { assigned, workload: beforeWorkload, risk: beforeRisk },
      after: { assigned: after, workload: afterWorkload, risk: afterRisk },
      riskDelta: this.riskRank(afterRisk.severity) - this.riskRank(beforeRisk.severity),
      confidence: afterRisk.confidence,
      maturityState: afterRisk.state === 'READY' ? 'ACTIVE' : 'WARMING_UP',
      reasons: [...new Set([...afterWorkload.reasons, ...afterRisk.reasons])],
      reasonCodes: [...new Set([...afterWorkload.reasons, ...afterRisk.reasons])],
    };
  }

  comparePlacement(
    source: TechnicianAssignedWeeklyWorkload, sourceBaseline: TechnicianWeeklyBaseline,
    target: TechnicianAssignedWeeklyWorkload, targetBaseline: TechnicianWeeklyBaseline,
    riskMaturity: CapabilityMaturity | undefined, change: WhatIfChange, dataQuality?: DataQualityAssessment,
  ) {
    const sourceScenario = this.simulate(source, sourceBaseline, riskMaturity, change, dataQuality);
    const targetScenario = this.simulate(target, targetBaseline, riskMaturity, change, dataQuality);
    const sourceRank = this.riskRank(sourceScenario.after.risk.severity);
    const targetRank = this.riskRank(targetScenario.after.risk.severity);
    const preferredTechnicianId = sourceRank < targetRank ? source.technicianId
      : targetRank < sourceRank ? target.technicianId : null;
    return {
      engineVersion: AI_ENGINE_VERSION,
      mode: 'TECHNICIAN_PLACEMENT_COMPARISON',
      sourceTechnicianId: source.technicianId, targetTechnicianId: target.technicianId,
      change, sourceScenario, targetScenario, preferredTechnicianId,
      confidence: sourceScenario.confidence === 'UNKNOWN' || targetScenario.confidence === 'UNKNOWN' ? 'UNKNOWN'
        : sourceScenario.confidence === 'LOW' || targetScenario.confidence === 'LOW' ? 'LOW'
        : sourceScenario.confidence === 'MEDIUM' || targetScenario.confidence === 'MEDIUM' ? 'MEDIUM' : 'HIGH',
      maturityState: sourceScenario.maturityState === 'ACTIVE' && targetScenario.maturityState === 'ACTIVE' ? 'ACTIVE' : 'WARMING_UP',
      reasonCodes: preferredTechnicianId ? ['LOWER_POST_CHANGE_RISK'] : ['POST_CHANGE_RISK_TIED'],
      constraints: ['SIMULATION_ONLY', 'NO_AUTOMATIC_ASSIGNMENT_CHANGE'],
    };
  }

  simulateRegionPlacement(
    region: RegionWorkloadVector,
    sourceTechnicianId: string | null,
    target: TechnicianAssignedWeeklyWorkload,
    targetBaseline: TechnicianWeeklyBaseline,
    riskMaturity: CapabilityMaturity | undefined,
    dataQuality?: DataQualityAssessment,
  ) {
    const change: WhatIfChange = {
      standardCurrentDelta: region.standardCurrent,
      standardCarryoverDelta: region.standardCarryover,
      smartcleanCurrentDelta: region.smartcleanCurrent,
      smartcleanCarryoverDelta: region.smartcleanCarryover,
      coolerDelta: region.coolerCount,
      towerDelta: region.towerCount,
      tapDelta: region.tapCount,
      smarttapDelta: region.smarttapCount,
      equipmentUnknownPointDelta: region.equipmentUnknownPointCount,
      locatedPointDelta: region.locatedPointCount,
      unlocatedPointDelta: region.unlocatedPointCount,
    };
    const scenario = this.simulate(target, targetBaseline, riskMaturity, change, dataQuality);
    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      mode: 'REGION_PLACEMENT_SIMULATION',
      regionId: region.regionId,
      sourceTechnicianId,
      targetTechnicianId: target.technicianId,
      regionVector: region,
      scenario,
      confidence: scenario.confidence,
      maturityState: scenario.maturityState,
      reasonCodes: [...new Set(['REGION_REAL_WORKLOAD_VECTOR_APPLIED', ...scenario.reasons])],
      constraints: ['SIMULATION_ONLY', 'NO_AUTOMATIC_REGION_ASSIGNMENT_CHANGE', 'COMBINED_ROUTE_REQUIRES_POINT_LEVEL_RECALCULATION'],
    };
  }

  private apply(source: TechnicianAssignedWeeklyWorkload, change: WhatIfChange): TechnicianAssignedWeeklyWorkload {
    const add = (value: number, delta?: number) => Math.max(0, value + (delta ?? 0));
    const towerCount = add(source.assignedTowerCount, change.towerDelta);
    const effort = estimateServiceEffort(towerCount);
    return {
      ...source,
      standardCurrent: add(source.standardCurrent, change.standardCurrentDelta),
      standardCarryover: add(source.standardCarryover, change.standardCarryoverDelta),
      smartcleanCurrent: add(source.smartcleanCurrent, change.smartcleanCurrentDelta),
      smartcleanCarryover: add(source.smartcleanCarryover, change.smartcleanCarryoverDelta),
      assignedCoolerCount: add(source.assignedCoolerCount, change.coolerDelta),
      assignedTowerCount: towerCount,
      assignedServiceEffortMinMinutes: effort.minMinutes ?? 0,
      assignedServiceEffortMaxMinutes: effort.maxMinutes ?? 0,
      assignedServiceEffortMidpointMinutes: effort.midpointMinutes ?? 0,
      assignedTapCount: add(source.assignedTapCount, change.tapDelta),
      assignedSmarttapCount: add(source.assignedSmarttapCount, change.smarttapDelta),
      equipmentUnknownPointCount: add(source.equipmentUnknownPointCount, change.equipmentUnknownPointDelta),
      assignedLocatedPointCount: add(source.assignedLocatedPointCount, change.locatedPointDelta),
      assignedUnlocatedPointCount: add(source.assignedUnlocatedPointCount, change.unlocatedPointDelta),
      assignedRouteEstimateMeters: change.routeEstimateMeters === undefined ? source.assignedRouteEstimateMeters : Math.max(0, change.routeEstimateMeters),
      assignedFieldP90RadiusMeters: change.fieldP90RadiusMeters === undefined ? source.assignedFieldP90RadiusMeters : Math.max(0, change.fieldP90RadiusMeters),
    };
  }

  private riskRank(value: string) { return ({ UNKNOWN: -1, LOW: 0, MEDIUM: 1, HIGH: 2 } as Record<string, number>)[value] ?? -1; }
}
