import { Injectable } from '@nestjs/common';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { BaselineBand, TechnicianWeeklyBaseline } from './technician-baseline.types';
import { WeeklyWorkloadAssessment, WorkloadPressureBand } from './weekly-workload.types';

@Injectable()
export class WeeklyWorkloadService {
  assess(
    assigned: TechnicianAssignedWeeklyWorkload,
    baseline: TechnicianWeeklyBaseline,
  ): WeeklyWorkloadAssessment {
    const evidenceReady = baseline.state === 'ACTIVE';
    const reasons = [...baseline.reasons];
    const assignedWorkCount = assigned.standardCurrent + assigned.standardCarryover + assigned.smartcleanCurrent + assigned.smartcleanCarryover;

    if (!evidenceReady) reasons.push('BASELINE_NOT_ACTIVE');

    const equipmentUsable = evidenceReady && assigned.equipmentUnknownPointCount === 0 && (assignedWorkCount === 0 || assigned.equipmentKnownPointCount > 0);
    if (assigned.equipmentUnknownPointCount > 0) reasons.push('ASSIGNED_EQUIPMENT_PROFILE_INCOMPLETE');
    else if (assignedWorkCount > 0 && assigned.equipmentKnownPointCount === 0) reasons.push('ASSIGNED_EQUIPMENT_LOAD_NOT_AVAILABLE');

    const locationUsable = evidenceReady && assigned.assignedUnlocatedPointCount === 0 && (assignedWorkCount === 0 || assigned.assignedLocatedPointCount > 0);
    if (assigned.assignedUnlocatedPointCount > 0) reasons.push('ASSIGNED_LOCATION_PROFILE_INCOMPLETE');
    else if (assignedWorkCount > 0 && assigned.assignedLocatedPointCount === 0) reasons.push('ASSIGNED_TRAVEL_LOAD_NOT_AVAILABLE');

    const servicePressure = {
      coolerCount: equipmentUsable ? this.pressure(assigned.assignedCoolerCount, baseline.service.coolerCount) : 'UNKNOWN' as WorkloadPressureBand,
      towerCount: equipmentUsable ? this.pressure(assigned.assignedTowerCount, baseline.service.towerCount) : 'UNKNOWN' as WorkloadPressureBand,
      tapCount: equipmentUsable ? this.pressure(assigned.assignedTapCount, baseline.service.tapCount) : 'UNKNOWN' as WorkloadPressureBand,
      smarttapCount: equipmentUsable ? this.pressure(assigned.assignedSmarttapCount, baseline.service.smarttapCount) : 'UNKNOWN' as WorkloadPressureBand,
    };

    const assignedRadius = assignedWorkCount === 0 ? 0 : assigned.assignedFieldP90RadiusMeters;
    const fieldRadiusPressure = locationUsable && assignedRadius !== null
      ? this.pressure(assignedRadius, baseline.travel.fieldP90RadiusMeters)
      : 'UNKNOWN';

    // A real route distance needs an ordered/optimized route; do not compare an unordered point set
    // with the historical performed-route baseline and pretend that it is equivalent evidence.
    reasons.push('ASSIGNED_ROUTE_ESTIMATE_NOT_AVAILABLE');

    return {
      technicianId: assigned.technicianId,
      evidenceState: evidenceReady ? 'READY' : 'INSUFFICIENT_DATA',
      baselineState: baseline.state,
      baselineConfidence: baseline.confidence,
      assigned: {
        standardCurrent: assigned.standardCurrent,
        standardCarryover: assigned.standardCarryover,
        smartcleanCurrent: assigned.smartcleanCurrent,
        smartcleanCarryover: assigned.smartcleanCarryover,
      },
      servicePressure,
      travelPressure: {
        routeDistanceMeters: 'UNKNOWN',
        fieldP90RadiusMeters: fieldRadiusPressure,
      },
      reasons: [...new Set(reasons)],
    };
  }

  private pressure(value: number, baseline: BaselineBand): WorkloadPressureBand {
    if (baseline.p75 === null || baseline.p90 === null) return 'UNKNOWN';
    if (value > baseline.p90) return 'ABOVE_P90';
    if (value > baseline.p75) return 'ABOVE_P75';
    return 'WITHIN_BASELINE';
  }
}
