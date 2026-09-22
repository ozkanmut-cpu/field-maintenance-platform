export const DEMO_DATASET = {
  regionName: 'Kordon Operasyon Bölgesi',
  pointCodePrefix: 'KOR-',
  pointNamePrefix: '',
  technicianUsername: 'ozge.kaya',
  helperUsername: 'can.durmaz',
} as const;

export const showcaseCoverage = {
  pointCount: 11,
  maintenanceVisits: 7,
  paperworkStates: ['PENDING', 'PRESENT', 'MISSING', 'PENDING_REVIEW', 'APPROVED'],
  includesPartialMaintenance: true,
  includesPastDatedMaintenance: true,
  includesLocationReview: true,
} as const;

export function demoUsername(kind: 'technician' | 'helper') {
  return kind === 'technician' ? DEMO_DATASET.technicianUsername : DEMO_DATASET.helperUsername;
}

export function isDemoEntityName(value: string | null | undefined) {
  return Boolean(value && value === DEMO_DATASET.regionName);
}

// Child-first order keeps the purge safe under database foreign keys.
export const purgeOrder = [
  'paperworkStatusHistory', 'maintenanceReviewResolution', 'sapConfirmationReconciliation',
  'maintenanceVisit', 'maintenanceAttempt', 'nonMaintenanceVisit', 'prospectVisit',
  'pointAssignment', 'pointAlias', 'maintenanceObligation', 'point', 'prospectCustomer',
  'technicianHelpPermission', 'adminAuditLog', 'region', 'user',
] as const;
