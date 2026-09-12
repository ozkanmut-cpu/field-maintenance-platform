import { TechnicianBaselineConfidence, TechnicianBaselineState } from './technician-baseline.types';

export type WorkloadEvidenceState = 'INSUFFICIENT_DATA' | 'READY';
export type WorkloadPressureBand = 'WITHIN_BASELINE' | 'ABOVE_P75' | 'ABOVE_P90' | 'UNKNOWN';

export type WeeklyAssignedWorkloadVector = {
  standardCurrent: number;
  standardCarryover: number;
  smartcleanCurrent: number;
  smartcleanCarryover: number;
};

export type WeeklyWorkloadAssessment = {
  technicianId: string;
  evidenceState: WorkloadEvidenceState;
  baselineState: TechnicianBaselineState;
  baselineConfidence: TechnicianBaselineConfidence;
  assigned: WeeklyAssignedWorkloadVector;
  servicePressure: {
    coolerCount: WorkloadPressureBand;
    towerCount: WorkloadPressureBand;
    tapCount: WorkloadPressureBand;
    smarttapCount: WorkloadPressureBand;
  };
  travelPressure: {
    routeDistanceMeters: WorkloadPressureBand;
    fieldP90RadiusMeters: WorkloadPressureBand;
  };
  reasons: string[];
};
