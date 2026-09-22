import { MaintenanceType, PrismaClient, PaperworkKind, PaperworkStatus, PointAssignmentKind, PointStatus, UserRole } from '@prisma/client';
import { hashPassword } from '../auth/password';
import { DEMO_DATASET } from './demo-data-plan';

const prisma = new PrismaClient();
const now = new Date();
const dateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const datasetNote = 'Silinebilir önizleme veri paketi — gerçek operasyon verisi değildir.';

type DemoUsers = { technician: { id: string }, helper: { id: string } };

async function purge() {
  const region = await prisma.region.findUnique({ where: { name: DEMO_DATASET.regionName }, select: { id: true } });
  const points = region ? await prisma.point.findMany({ where: { regionId: region.id }, select: { id: true } }) : [];
  const pointIds = points.map((point) => point.id);
  const users = await prisma.user.findMany({ where: { username: { in: [DEMO_DATASET.technicianUsername, DEMO_DATASET.helperUsername] } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const visits = pointIds.length ? await prisma.maintenanceVisit.findMany({ where: { pointId: { in: pointIds } }, select: { id: true } }) : [];
  const visitIds = visits.map((visit) => visit.id);
  const prospects = userIds.length ? await prisma.prospectCustomer.findMany({ where: { createdById: { in: userIds } }, select: { id: true } }) : [];
  const prospectIds = prospects.map((prospect) => prospect.id);

  await prisma.$transaction(async (tx) => {
    if (visitIds.length) {
      await tx.paperworkStatusHistory.deleteMany({ where: { visitId: { in: visitIds } } });
      await tx.maintenanceReviewResolution.deleteMany({ where: { visitId: { in: visitIds } } });
      await tx.sapConfirmationReconciliation.deleteMany({ where: { visitId: { in: visitIds } } });
    }
    await tx.adminAuditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { note: datasetNote }] } });
    if (pointIds.length) {
      await tx.maintenanceVisit.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.maintenanceAttempt.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.nonMaintenanceVisit.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.pointAssignment.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.pointAlias.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.maintenanceObligation.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.point.deleteMany({ where: { id: { in: pointIds } } });
    }
    if (prospectIds.length) {
      await tx.prospectVisit.deleteMany({ where: { prospectId: { in: prospectIds } } });
      await tx.prospectCustomer.deleteMany({ where: { id: { in: prospectIds } } });
    }
    if (userIds.length) {
      await tx.technicianHelpPermission.deleteMany({ where: { OR: [{ helperId: { in: userIds } }, { targetId: { in: userIds } }] } });
    }
    if (region) await tx.region.delete({ where: { id: region.id } });
    if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
  return { points: pointIds.length, users: userIds.length, region: Boolean(region) };
}

async function seed(password: string) {
  if (password.length < 16) throw new Error('DEMO_TECHNICIAN_PASSWORD en az 16 karakter olmalı');
  await purge();
  const users: DemoUsers = await prisma.$transaction(async (tx) => {
    const passwordHash = hashPassword(password);
    const technician = await tx.user.create({ data: { name: 'Özge Kaya', username: DEMO_DATASET.technicianUsername, role: UserRole.TECHNICIAN, active: true, passwordHash } });
    const helper = await tx.user.create({ data: { name: 'Can Durmaz', username: DEMO_DATASET.helperUsername, role: UserRole.TECHNICIAN, active: true, passwordHash } });
    return { technician, helper };
  });

  const region = await prisma.region.create({ data: { name: DEMO_DATASET.regionName, technicianId: users.technician.id } });
  const pointInput = [
    { code: 'KOR-1001', name: 'Mavi Köşe Birahanesi', status: PointStatus.ACTIVE, coolers: 5, type: MaintenanceType.STANDARD },
    { code: 'KOR-1002', name: 'Ege Sofrası', status: PointStatus.ACTIVE, coolers: 4, type: MaintenanceType.STANDARD },
    { code: 'KOR-1003', name: 'Alsancak Meyhane', status: PointStatus.ACTIVE, coolers: 3, type: MaintenanceType.STANDARD },
    { code: 'KOR-1004', name: 'Marina Teras', status: PointStatus.ACTIVE, coolers: 6, type: MaintenanceType.SMARTCLEAN },
    { code: 'KOR-1005', name: 'Göztepe Bahçe', status: PointStatus.ACTIVE, coolers: 2, type: MaintenanceType.STANDARD },
    { code: 'KOR-1006', name: 'Bostanlı Sahne', status: PointStatus.ACTIVE, coolers: 4, type: MaintenanceType.STANDARD },
    { code: 'KOR-1007', name: 'Urla İskele', status: PointStatus.ACTIVE, coolers: 3, type: MaintenanceType.SMARTCLEAN },
    { code: 'KOR-1008', name: 'Bornova Yakamoz', status: PointStatus.ACTIVE, coolers: 2, type: MaintenanceType.STANDARD },
    { code: 'KOR-1009', name: 'Karşıyaka Tat', status: PointStatus.ACTIVE, coolers: 4, type: MaintenanceType.STANDARD },
    { code: 'KOR-1010', name: 'Çeşme Rıhtım', status: PointStatus.PASSIVE, coolers: 3, type: MaintenanceType.STANDARD },
    { code: 'KOR-1011', name: 'Foça Taş Ev', status: PointStatus.CANCELLED, coolers: 1, type: MaintenanceType.STANDARD },
  ] as const;
  const points = await Promise.all(pointInput.map((point, index) => prisma.point.create({ data: {
    code: point.code, name: point.name, sapName: point.name, address: `${['Kıbrıs Şehitleri Cd.', 'Atatürk Blv.', 'İnönü Cd.', 'Vapur İskelesi Sk.'][index % 4]} No:${12 + index}, İzmir`, regionId: region.id, status: point.status,
    maintenanceType: point.type, maintenanceWeek: index % 2 ? 2 : 1, smartcleanReferenceAt: point.type === MaintenanceType.SMARTCLEAN ? new Date(dateOnly.getTime() - 50 * 86400000) : null,
    coolerCount: point.coolers, towerCount: Math.max(1, Math.ceil(point.coolers / 3)), tapCount: point.coolers, smarttapCount: point.type === MaintenanceType.SMARTCLEAN ? 1 : 0,
    canonicalLatitude: 38.432 + index / 1000, canonicalLongitude: 27.145 + index / 1000, locationSource: 'MANUAL', locationConfidence: 100,
  } }))) as any[];
  const [active, paperwork, reviewPoint, approvedPoint, presentPoint, pendingPoint, pastPoint, attemptPoint] = points;
  await prisma.$transaction(async (tx) => {
    await tx.technicianHelpPermission.create({ data: { helperId: users.helper.id, targetId: users.technician.id } });
    await tx.pointAlias.createMany({ data: [
      { pointId: active.id, alias: 'Köşe Pub', normalized: 'köşe pub', createdById: users.technician.id },
      { pointId: paperwork.id, alias: 'Ege Lokanta', normalized: 'ege lokanta', createdById: users.technician.id },
      { pointId: approvedPoint.id, alias: 'Marina Üst Kat', normalized: 'marina üst kat', createdById: users.technician.id },
    ] });
    await tx.pointAssignment.create({ data: { pointId: active.id, technicianId: users.helper.id, kind: PointAssignmentKind.TEMPORARY, startsAt: now, endsAt: new Date(now.getTime() + 7 * 86400000), reason: 'Haftalık vardiya desteği', createdById: users.technician.id } });
    await tx.maintenanceObligation.createMany({ data: points.slice(0, 9).map((point, index) => ({ pointId: point.id, cycleKey: `KOR-OPEN-${index + 1}`, dueStart: dateOnly, dueEnd: new Date(dateOnly.getTime() + 6 * 86400000), status: 'OPEN' })) });
  });
  const partial = await prisma.maintenanceVisit.create({ data: {
    pointId: active.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 3600000), deviceRecordedAt: now,
    latitude: active.canonicalLatitude, longitude: active.canonicalLongitude, accuracyMeters: 12, locationCapturedAt: now,
    totalCoolerCount: 5, maintainedCoolerCount: 4, missingMaintenanceCount: 1, missingMaintenanceExplanation: 'Bir soğutucu erişime kapalıydı.',
    coolerCount: 5, towerCount: 1, tapCount: 5, smarttapCount: 1, equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.PENDING,
    confirmationStatus: PaperworkStatus.PENDING, idempotencyKey: 'showcase-partial-maintenance-v1',
  } });
  const missing = await prisma.maintenanceVisit.create({ data: {
    pointId: paperwork.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 86400000), deviceRecordedAt: now,
    latitude: paperwork.canonicalLatitude, longitude: paperwork.canonicalLongitude, accuracyMeters: 18, locationCapturedAt: now,
    totalCoolerCount: 4, maintainedCoolerCount: 4, missingMaintenanceCount: 0, coolerCount: 4, towerCount: 1, tapCount: 4, smarttapCount: 0,
    equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.MISSING, confirmationStatus: PaperworkStatus.MISSING, idempotencyKey: 'showcase-missing-paperwork-v1',
  } });
  const review = await prisma.maintenanceVisit.create({ data: { pointId: reviewPoint.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 2 * 86400000), deviceRecordedAt: now, latitude: reviewPoint.canonicalLatitude, longitude: reviewPoint.canonicalLongitude, accuracyMeters: 15, locationCapturedAt: now, totalCoolerCount: 3, maintainedCoolerCount: 3, missingMaintenanceCount: 0, coolerCount: 3, towerCount: 1, tapCount: 3, smarttapCount: 0, equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.PENDING_REVIEW, confirmationStatus: PaperworkStatus.PRESENT, idempotencyKey: 'showcase-review-paperwork-v1' } });
  const approved = await prisma.maintenanceVisit.create({ data: { pointId: approvedPoint.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 3 * 86400000), deviceRecordedAt: now, latitude: approvedPoint.canonicalLatitude, longitude: approvedPoint.canonicalLongitude, accuracyMeters: 11, locationCapturedAt: now, totalCoolerCount: 6, maintainedCoolerCount: 6, missingMaintenanceCount: 0, coolerCount: 6, towerCount: 2, tapCount: 6, smarttapCount: 1, equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.APPROVED, confirmationStatus: PaperworkStatus.APPROVED, confirmationApprovalSource: 'MANUAL_ADMIN', idempotencyKey: 'showcase-approved-v1' } });
  const present = await prisma.maintenanceVisit.create({ data: { pointId: presentPoint.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 4 * 86400000), deviceRecordedAt: now, latitude: presentPoint.canonicalLatitude, longitude: presentPoint.canonicalLongitude, accuracyMeters: 286, locationCapturedAt: now, locationReviewRequired: true, reviewRecommended: true, reviewReason: 'Nokta referansından uzak saha kaydı', totalCoolerCount: 2, maintainedCoolerCount: 2, missingMaintenanceCount: 0, coolerCount: 2, towerCount: 1, tapCount: 2, smarttapCount: 0, equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.PRESENT, idempotencyKey: 'showcase-location-review-v1' } });
  const pending = await prisma.maintenanceVisit.create({ data: { pointId: pendingPoint.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 5 * 86400000), deviceRecordedAt: now, latitude: pendingPoint.canonicalLatitude, longitude: pendingPoint.canonicalLongitude, accuracyMeters: 12, locationCapturedAt: now, totalCoolerCount: 4, maintainedCoolerCount: 4, missingMaintenanceCount: 0, coolerCount: 4, towerCount: 2, tapCount: 4, smarttapCount: 0, equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.PENDING, confirmationStatus: PaperworkStatus.PENDING, idempotencyKey: 'showcase-pending-v1' } });
  const past = await prisma.maintenanceVisit.create({ data: { pointId: pastPoint.id, technicianId: users.technician.id, performedAt: new Date(dateOnly.getTime() - 6 * 86400000), deviceRecordedAt: now, enteredLate: true, lateEntryMinutes: 8640, lateEntryReason: 'Teknik servis kaydı gün sonunda iletildi.', locationPresenceConfirmed: false, locationLearningEligible: false, totalCoolerCount: 3, maintainedCoolerCount: 3, missingMaintenanceCount: 0, coolerCount: 3, towerCount: 1, tapCount: 3, smarttapCount: 1, equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.PRESENT, confirmationStatus: PaperworkStatus.PENDING, idempotencyKey: 'showcase-past-dated-v1' } });
  await prisma.$transaction(async (tx) => {
    await tx.paperworkStatusHistory.createMany({ data: [
      { visitId: missing.id, kind: PaperworkKind.CONFIRMATION, previousStatus: PaperworkStatus.PENDING, newStatus: PaperworkStatus.MISSING, changedById: users.technician.id, note: datasetNote },
      { visitId: missing.id, kind: PaperworkKind.SERVICE_SLIP, previousStatus: PaperworkStatus.PENDING, newStatus: PaperworkStatus.MISSING, changedById: users.technician.id, note: datasetNote },
      { visitId: review.id, kind: PaperworkKind.SERVICE_SLIP, previousStatus: PaperworkStatus.MISSING, newStatus: PaperworkStatus.PENDING_REVIEW, changedById: users.technician.id, note: datasetNote },
      { visitId: approved.id, kind: PaperworkKind.CONFIRMATION, previousStatus: PaperworkStatus.PRESENT, newStatus: PaperworkStatus.APPROVED, changedById: users.technician.id, note: datasetNote },
    ] });
    await tx.maintenanceAttempt.create({ data: { pointId: attemptPoint.id, technicianId: users.technician.id, reason: 'BUSINESS_CLOSED', note: 'İşletme kapalıydı; sonraki vardiyada tekrar ziyaret edilecek.', latitude: attemptPoint.canonicalLatitude!, longitude: attemptPoint.canonicalLongitude!, accuracyMeters: 10, locationCapturedAt: now, idempotencyKey: 'showcase-attempt-v1' } });
    await tx.maintenanceAttempt.create({ data: { pointId: pendingPoint.id, technicianId: users.helper.id, reason: 'AUTHORIZED_PERSON_UNAVAILABLE', note: 'Yetkili kişi bulunamadığı için teslim alınamadı.', latitude: pendingPoint.canonicalLatitude!, longitude: pendingPoint.canonicalLongitude!, accuracyMeters: 14, locationCapturedAt: now, idempotencyKey: 'showcase-attempt-v2' } });
    await tx.nonMaintenanceVisit.create({ data: { pointId: active.id, technicianId: users.technician.id, purpose: 'BREAKDOWN', note: 'Soğutma performansı için ilk saha kontrolü yapıldı.', latitude: active.canonicalLatitude!, longitude: active.canonicalLongitude!, accuracyMeters: 9, locationCapturedAt: now, idempotencyKey: 'showcase-non-maintenance-v1' } });
    const prospect = await tx.prospectCustomer.create({ data: { name: 'Vapurüstü Balık Evi', sapNo: 'A-640128', source: 'MANUAL', address: 'Atatürk Cd. No:47, Konak / İzmir', latitude: 38.438, longitude: 27.151, createdById: users.technician.id } });
    await tx.prospectVisit.create({ data: { prospectId: prospect.id, technicianId: users.technician.id, purpose: 'SURVEY', note: 'Yeni tesis için keşif ziyareti tamamlandı.', latitude: 38.438, longitude: 27.151, accuracyMeters: 10, locationCapturedAt: now, idempotencyKey: 'showcase-prospect-visit-v1' } });
    await tx.adminAuditLog.createMany({ data: [
      { entityType: 'SHOWCASE_DATASET', entityId: region.id, action: 'SEED_CREATED', actorId: users.technician.id, newValue: { points: pointInput.map((point) => point.code) }, note: datasetNote },
      { entityType: 'MaintenanceVisit', entityId: partial.id, action: 'PARTIAL_MAINTENANCE', actorId: users.technician.id, newValue: { totalCoolers: 5, maintainedCoolers: 4 }, note: datasetNote },
    ] });
  });
  return { region: region.name, username: DEMO_DATASET.technicianUsername, points: points.length, visits: [partial, missing, review, approved, present, pending, past].length };
}

async function main() {
  const action = process.argv[2];
  if (action === 'purge') { console.log(JSON.stringify({ action, ...(await purge()) })); return; }
  if (action === 'seed') {
    const password = process.env.DEMO_TECHNICIAN_PASSWORD ?? '';
    console.log(JSON.stringify({ action, ...(await seed(password)) })); return;
  }
  throw new Error('Kullanım: demo-data.cli.ts seed | purge');
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
