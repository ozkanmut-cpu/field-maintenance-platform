import { Injectable } from '@nestjs/common';
import { AI_ENGINE_VERSION } from './ai-version';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { CapabilityMaturity } from './data-maturity.types';
import { RiskEngineService } from './risk-engine.service';
import { TechnicianWeeklyBaseline } from './technician-baseline.types';
import { WeeklyWorkloadService } from './weekly-workload.service';

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

  simulate(assigned: TechnicianAssignedWeeklyWorkload, baseline: TechnicianWeeklyBaseline, riskMaturity: CapabilityMaturity | undefined, change: WhatIfChange) {
    const beforeWorkload = this.workloadEngine.assess(assigned, baseline);
    const beforeRisk = this.riskEngine.assessTechnician(assigned, baseline, beforeWorkload, riskMaturity);
    const after = this.apply(assigned, change);
    const afterWorkload = this.workloadEngine.assess(after, baseline);
    const afterRisk = this.riskEngine.assessTechnician(after, baseline, afterWorkload, riskMaturity);
    return {
      engineVersion: AI_ENGINE_VERSION,
      technicianId: assigned.technicianId,
      change,
      before: { assigned, workload: beforeWorkload, risk: beforeRisk },
      after: { assigned: after, workload: afterWorkload, risk: afterRisk },
      riskDelta: this.riskRank(afterRisk.severity) - this.riskRank(beforeRisk.severity),
      confidence: afterRisk.confidence,
      reasons: [...new Set([...afterWorkload.reasons, ...afterRisk.reasons])],
    };
  }

  private apply(source: TechnicianAssignedWeeklyWorkload, change: WhatIfChange): TechnicianAssignedWeeklyWorkload {
    const add = (value: number, delta?: number) => Math.max(0, value + (delta ?? 0));
    return {
      ...source,
      standardCurrent: add(source.standardCurrent, change.standardCurrentDelta),
      standardCarryover: add(source.standardCarryover, change.standardCarryoverDelta),
      smartcleanCurrent: add(source.smartcleanCurrent, change.smartcleanCurrentDelta),
      smartcleanCarryover: add(source.smartcleanCarryover, change.smartcleanCarryoverDelta),
      assignedCoolerCount: add(source.assignedCoolerCount, change.coolerDelta),
      assignedTowerCount: add(source.assignedTowerCount, change.towerDelta),
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
