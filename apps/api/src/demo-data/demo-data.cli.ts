import { PrismaClient, PaperworkKind, PaperworkStatus, PointAssignmentKind, PointStatus, UserRole } from '@prisma/client';
import { hashPassword } from '../auth/password';
import { DEMO_DATASET } from './demo-data-plan';

const prisma = new PrismaClient();
const now = new Date();
const dateOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const datasetNote = 'Silinebilir demo veri paketi — gerçek operasyon verisi değildir.';

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
    const technician = await tx.user.create({ data: { name: 'DEMO Teknisyen', username: DEMO_DATASET.technicianUsername, role: UserRole.TECHNICIAN, active: true, passwordHash } });
    const helper = await tx.user.create({ data: { name: 'DEMO Yardımcı', username: DEMO_DATASET.helperUsername, role: UserRole.TECHNICIAN, active: true, passwordHash } });
    return { technician, helper };
  });

  const region = await prisma.region.create({ data: { name: DEMO_DATASET.regionName, technicianId: users.technician.id } });
  const pointInput = [
    ['DEMO-AKTIF', 'DEMO — Mavi Köşe', PointStatus.ACTIVE, 5],
    ['DEMO-EVRAK', 'DEMO — Eksik Evrak', PointStatus.ACTIVE, 4],
    ['DEMO-PASIF', 'DEMO — Pasif Nokta', PointStatus.PASSIVE, 2],
    ['DEMO-IPTAL', 'DEMO — İptal Nokta', PointStatus.CANCELLED, 1],
  ] as const;
  const points = await Promise.all(pointInput.map(([code, name, status, coolers], index) => prisma.point.create({ data: {
    code, name, sapName: name, address: `Demo Sokak No:${index + 1}, Alsancak / İzmir`, regionId: region.id, status,
    maintenanceWeek: index % 2 ? 2 : 1, coolerCount: coolers, towerCount: 1, tapCount: coolers, smarttapCount: index === 0 ? 1 : 0,
    canonicalLatitude: 38.432 + index / 1000, canonicalLongitude: 27.145 + index / 1000, locationSource: 'MANUAL', locationConfidence: 100,
  } }))) as any[];
  const active = points[0]; const paperwork = points[1];
  await prisma.$transaction(async (tx) => {
    await tx.technicianHelpPermission.create({ data: { helperId: users.helper.id, targetId: users.technician.id } });
    await tx.pointAlias.createMany({ data: [
      { pointId: active.id, alias: 'Demo Mavi', normalized: 'demo mavi', createdById: users.technician.id },
      { pointId: paperwork.id, alias: 'Demo Evrak', normalized: 'demo evrak', createdById: users.technician.id },
    ] });
    await tx.pointAssignment.create({ data: { pointId: active.id, technicianId: users.helper.id, kind: PointAssignmentKind.TEMPORARY, startsAt: now, endsAt: new Date(now.getTime() + 7 * 86400000), reason: 'Demo geçici atama', createdById: users.technician.id } });
    await tx.maintenanceObligation.createMany({ data: [
      { pointId: active.id, cycleKey: 'DEMO-OPEN-1', dueStart: dateOnly, dueEnd: new Date(dateOnly.getTime() + 6 * 86400000), status: 'OPEN' },
      { pointId: paperwork.id, cycleKey: 'DEMO-OPEN-2', dueStart: dateOnly, dueEnd: new Date(dateOnly.getTime() + 6 * 86400000), status: 'OPEN' },
    ] });
  });
  const partial = await prisma.maintenanceVisit.create({ data: {
    pointId: active.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 3600000), deviceRecordedAt: now,
    latitude: active.canonicalLatitude, longitude: active.canonicalLongitude, accuracyMeters: 12, locationCapturedAt: now,
    totalCoolerCount: 5, maintainedCoolerCount: 4, missingMaintenanceCount: 1, missingMaintenanceExplanation: 'Bir soğutucu erişime kapalıydı.',
    coolerCount: 5, towerCount: 1, tapCount: 5, smarttapCount: 1, equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.PENDING,
    confirmationStatus: PaperworkStatus.PENDING, idempotencyKey: 'demo-partial-maintenance-v1',
  } });
  const missing = await prisma.maintenanceVisit.create({ data: {
    pointId: paperwork.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 86400000), deviceRecordedAt: now,
    latitude: paperwork.canonicalLatitude, longitude: paperwork.canonicalLongitude, accuracyMeters: 18, locationCapturedAt: now,
    totalCoolerCount: 4, maintainedCoolerCount: 4, missingMaintenanceCount: 0, coolerCount: 4, towerCount: 1, tapCount: 4, smarttapCount: 0,
    equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.MISSING, confirmationStatus: PaperworkStatus.MISSING, idempotencyKey: 'demo-missing-paperwork-v1',
  } });
  const review = await prisma.maintenanceVisit.create({ data: {
    pointId: paperwork.id, technicianId: users.technician.id, performedAt: new Date(now.getTime() - 2 * 86400000), deviceRecordedAt: now,
    latitude: paperwork.canonicalLatitude, longitude: paperwork.canonicalLongitude, accuracyMeters: 15, locationCapturedAt: now,
    totalCoolerCount: 4, maintainedCoolerCount: 4, missingMaintenanceCount: 0, coolerCount: 4, towerCount: 1, tapCount: 4, smarttapCount: 0,
    equipmentConfirmed: true, serviceSlipStatus: PaperworkStatus.PENDING_REVIEW, confirmationStatus: PaperworkStatus.PRESENT, idempotencyKey: 'demo-review-paperwork-v1',
  } });
  await prisma.$transaction(async (tx) => {
    await tx.paperworkStatusHistory.createMany({ data: [
      { visitId: missing.id, kind: PaperworkKind.CONFIRMATION, previousStatus: PaperworkStatus.PENDING, newStatus: PaperworkStatus.MISSING, changedById: users.technician.id, note: datasetNote },
      { visitId: missing.id, kind: PaperworkKind.SERVICE_SLIP, previousStatus: PaperworkStatus.PENDING, newStatus: PaperworkStatus.MISSING, changedById: users.technician.id, note: datasetNote },
      { visitId: review.id, kind: PaperworkKind.SERVICE_SLIP, previousStatus: PaperworkStatus.MISSING, newStatus: PaperworkStatus.PENDING_REVIEW, changedById: users.technician.id, note: datasetNote },
    ] });
    await tx.maintenanceAttempt.create({ data: { pointId: paperwork.id, technicianId: users.technician.id, reason: 'BUSINESS_CLOSED', note: datasetNote, latitude: paperwork.canonicalLatitude!, longitude: paperwork.canonicalLongitude!, accuracyMeters: 10, locationCapturedAt: now, idempotencyKey: 'demo-attempt-v1' } });
    await tx.nonMaintenanceVisit.create({ data: { pointId: active.id, technicianId: users.technician.id, purpose: 'BREAKDOWN', note: datasetNote, latitude: active.canonicalLatitude!, longitude: active.canonicalLongitude!, accuracyMeters: 9, locationCapturedAt: now, idempotencyKey: 'demo-non-maintenance-v1' } });
    const prospect = await tx.prospectCustomer.create({ data: { name: 'DEMO — Yeni Müşteri Adayı', sapNo: 'DEMO-PROSPECT', source: 'MANUAL', address: 'Demo Cad. No:5, İzmir', latitude: 38.438, longitude: 27.151, createdById: users.technician.id } });
    await tx.prospectVisit.create({ data: { prospectId: prospect.id, technicianId: users.technician.id, purpose: 'SURVEY', note: datasetNote, latitude: 38.438, longitude: 27.151, accuracyMeters: 10, locationCapturedAt: now, idempotencyKey: 'demo-prospect-visit-v1' } });
    await tx.adminAuditLog.createMany({ data: [
      { entityType: 'DEMO_DATASET', entityId: region.id, action: 'SEED_CREATED', actorId: users.technician.id, newValue: { points: pointInput.map(([code]) => code) }, note: datasetNote },
      { entityType: 'MaintenanceVisit', entityId: partial.id, action: 'PARTIAL_MAINTENANCE', actorId: users.technician.id, newValue: { totalCoolers: 5, maintainedCoolers: 4 }, note: datasetNote },
    ] });
  });
  return { region: region.name, username: DEMO_DATASET.technicianUsername, points: points.length };
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
