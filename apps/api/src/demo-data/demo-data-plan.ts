export const MOCKUP_DATASET = {
  regionName: 'Kordon Operasyon Bölgesi',
  pointCodePrefix: 'KOR-',
  pointNamePrefix: '',
  technicianUsername: 'mockup.ozge.kaya',
  helperUsername: 'mockup.can.durmaz',
} as const;

// Kept as a source-compatible alias; this label is never rendered to technicians.
export const DEMO_DATASET = MOCKUP_DATASET;

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

export const mockupEvidenceProfile = {
  visibleLabels: [
    'Kordon Operasyon Bölgesi', 'Mavi Köşe Birahanesi', 'Vapurüstü Balık Evi', 'Can Durmaz', 'Özge Kaya',
  ],
  help: { helperName: 'Can Durmaz', targetName: 'Özge Kaya' },
  flows: {
    partialMaintenance: { pointCode: 'KOR-1001', obligationStatus: 'COMPLETED', userVisibleOutcome: '4/5 soğutucu bakım · 1 eksik' },
    pastDatedMaintenance: { pointCode: 'KOR-1007', userVisibleOutcome: 'Geçmiş tarihli bakım kaydedildi' },
    locationDecision: { pointCode: 'KOR-1005', userVisibleOutcome: 'Hayır, ama bakımı yaptım' },
    failedMaintenance: { pointCode: 'KOR-1008', userVisibleOutcome: 'Kayıt oluşturmadan İşlere dön' },
    help: { pointCode: 'KOR-1001', userVisibleOutcome: 'Özge Kaya adına bakım kaydedildi' },
    nonMaintenanceCustomer: { pointCode: 'KOR-1001', userVisibleOutcome: 'Bakım dışı ziyaret kaydedildi' },
    nonMaintenanceNoCustomerFallback: { userVisibleOutcome: 'Açıklama ile ziyaret kaydedildi' },
    paperworkReview: { pointCode: 'KOR-1003', userVisibleOutcome: 'İnceleme bekliyor' },
  },
} as const;

type MockupEnvironment = Record<string, string | undefined>;
type ResetOperations<P, S> = { purge: () => Promise<P>; seed: () => Promise<S> };

export function buildMockupResetPlan(environment: MockupEnvironment) {
  if (environment.MOCKUP_DATASET !== 'mobile-evidence') throw new Error('MOCKUP_DATASET=mobile-evidence açık onayı gerekli');
  if (environment.NODE_ENV === 'production') throw new Error('Production runtime mockup reset kabul etmez');
  if (!environment.DATABASE_URL) throw new Error('Açık bir local mockup DATABASE_URL gerekli');

  const database = new URL(environment.DATABASE_URL);
  const databaseName = database.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname)) throw new Error('Yalnız local mockup veritabanı kabul edilir');
  if (!/(?:_mockup|_test)$/.test(databaseName)) throw new Error('Veritabanı adı _mockup veya _test ile bitmeli');

  return {
    action: 'reset' as const,
    databaseName,
    scope: { regionName: MOCKUP_DATASET.regionName, usernames: [MOCKUP_DATASET.technicianUsername, MOCKUP_DATASET.helperUsername] },
  };
}

export async function resetMockupDataset<P, S>(operations: ResetOperations<P, S>) {
  const purged = await operations.purge();
  const seeded = await operations.seed();
  return { purged, seeded };
}
