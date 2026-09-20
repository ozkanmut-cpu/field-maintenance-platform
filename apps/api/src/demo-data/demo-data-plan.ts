export const DEMO_DATASET = {
  regionName: '__DEMO__ Mobil ve Admin Önizleme',
  pointCodePrefix: 'DEMO-',
  pointNamePrefix: 'DEMO — ',
  technicianUsername: 'demo-teknisyen',
  helperUsername: 'demo-yardimci',
} as const;

export function demoUsername(kind: 'technician' | 'helper') {
  return kind === 'technician' ? DEMO_DATASET.technicianUsername : DEMO_DATASET.helperUsername;
}

export function isDemoEntityName(value: string | null | undefined) {
  return Boolean(value && (value === DEMO_DATASET.regionName || value.startsWith(DEMO_DATASET.pointNamePrefix)));
}

// Child-first order keeps the purge safe under database foreign keys.
export const purgeOrder = [
  'paperworkStatusHistory', 'maintenanceReviewResolution', 'sapConfirmationReconciliation',
  'maintenanceVisit', 'maintenanceAttempt', 'nonMaintenanceVisit', 'prospectVisit',
  'pointAssignment', 'pointAlias', 'maintenanceObligation', 'point', 'prospectCustomer',
  'technicianHelpPermission', 'adminAuditLog', 'region', 'user',
] as const;
