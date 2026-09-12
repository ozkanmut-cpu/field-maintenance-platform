import { Injectable } from '@nestjs/common';
import { TechnicianAssignedWeeklyWorkload } from './assigned-weekly-workload.service';
import { TechnicianWeeklyBaseline } from './technician-baseline.types';
import { WeeklyWorkloadAssessment } from './weekly-workload.types';

@Injectable()
export class WeeklyWorkloadService {
  assess(
    assigned: TechnicianAssignedWeeklyWorkload,
    baseline: TechnicianWeeklyBaseline,
  ): WeeklyWorkloadAssessment {
    const evidenceReady = baseline.state === 'ACTIVE';
    const reasons = [...baseline.reasons];

    if (!evidenceReady) reasons.push('BASELINE_NOT_ACTIVE');
    reasons.push('ASSIGNED_EQUIPMENT_LOAD_NOT_AVAILABLE');
    reasons.push('ASSIGNED_TRAVEL_LOAD_NOT_AVAILABLE');

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
      servicePressure: {
        coolerCount: 'UNKNOWN',
        towerCount: 'UNKNOWN',
        tapCount: 'UNKNOWN',
        smarttapCount: 'UNKNOWN',
      },
      travelPressure: {
        routeDistanceMeters: 'UNKNOWN',
        fieldP90RadiusMeters: 'UNKNOWN',
      },
      reasons: [...new Set(reasons)],
    };
  }
}
