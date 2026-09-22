import { Injectable } from '@nestjs/common';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { BaselineBand, TechnicianWeeklyBaseline } from './technician-baseline.types';
import { WeeklyWorkloadAssessment, WorkloadPressureBand } from './weekly-workload.types';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import { WorkloadCalibrationAssessment } from './workload-calibration.service';
import { buildServiceWorkloadIndex } from './service-workload-index';

@Injectable()
export class WeeklyWorkloadService {
  assess(
    assigned: TechnicianAssignedWeeklyWorkload,
    baseline: TechnicianWeeklyBaseline,
    calibration?: WorkloadCalibrationAssessment,
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

    const serviceWorkload = equipmentUsable && calibration
      ? buildServiceWorkloadIndex(
          { coolerCount: assigned.assignedCoolerCount, towerCount: assigned.assignedTowerCount, tapCount: assigned.assignedTapCount, smarttapCount: assigned.assignedSmarttapCount },
          { coolerCount: baseline.service.coolerCount.median, towerCount: baseline.service.towerCount.median, tapCount: baseline.service.tapCount.median, smarttapCount: baseline.service.smarttapCount.median },
          calibration.equipment, calibration.confidence,
        )
      : buildServiceWorkloadIndex(
          { coolerCount: null, towerCount: null, tapCount: null, smarttapCount: null },
          { coolerCount: null, towerCount: null, tapCount: null, smarttapCount: null }, [], 'LOW',
        );
    if (equipmentUsable && (!calibration || serviceWorkload.state !== 'READY')) reasons.push('SERVICE_WORKLOAD_MODEL_WARMING_UP');

    const assignedRadius = assignedWorkCount === 0 ? 0 : assigned.assignedFieldP90RadiusMeters;
    const fieldRadiusPressure = locationUsable && assignedRadius !== null
      ? this.pressure(assignedRadius, baseline.travel.fieldP90RadiusMeters)
      : 'UNKNOWN';

    const routeEstimate = assignedWorkCount === 0 ? 0 : assigned.assignedRouteEstimateMeters;
    const routePressure = locationUsable && routeEstimate !== null
      ? this.pressure(routeEstimate, baseline.travel.routeDistanceMeters)
      : 'UNKNOWN';
    const coherencePressure = locationUsable && assigned.assignedRouteCoherenceRatio !== null
      ? this.pressure(assigned.assignedRouteCoherenceRatio, baseline.travel.routeCoherenceRatio)
      : 'UNKNOWN';
    const fragmentationPressure = locationUsable && assigned.assignedFragmentationRatio !== null
      ? this.pressure(assigned.assignedFragmentationRatio, baseline.travel.fragmentationRatio)
      : 'UNKNOWN';
    const workAreaPressure = locationUsable && assigned.workAreaCenterDistanceMeters !== null
      ? this.pressure(assigned.workAreaCenterDistanceMeters, baseline.travel.fieldP90RadiusMeters)
      : 'UNKNOWN';
    if (assignedWorkCount > 0 && routeEstimate === null) reasons.push('ASSIGNED_ROUTE_ESTIMATE_NOT_AVAILABLE');

    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      technicianId: assigned.technicianId,
      maturityState: evidenceReady ? 'ACTIVE' : 'WARMING_UP',
      confidence: baseline.confidence,
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
      serviceWorkload,
      travelPressure: {
        routeDistanceMeters: routePressure,
        fieldP90RadiusMeters: fieldRadiusPressure,
        routeCoherenceRatio: coherencePressure,
        fragmentationRatio: fragmentationPressure,
        workAreaProximity: workAreaPressure,
      },
      reasons: [...new Set(reasons)],
      reasonCodes: [...new Set(reasons)],
    };
  }

  private pressure(value: number, baseline: BaselineBand): WorkloadPressureBand {
    if (baseline.p75 === null || baseline.p90 === null) return 'UNKNOWN';
    if (value > baseline.p90) return 'ABOVE_P90';
    if (value > baseline.p75) return 'ABOVE_P75';
    return 'WITHIN_BASELINE';
  }
}
