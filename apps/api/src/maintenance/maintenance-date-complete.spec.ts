import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MaintenanceObligationStatus, MaintenanceType, PointStatus, UserRole, VisitStatus } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

function makeService(created: any[]) {
  const point = {
    id: 'point-1', status: PointStatus.ACTIVE, maintenanceType: MaintenanceType.STANDARD,
    coolerCount: 1, towerCount: 0, tapCount: 0, smarttapCount: 0,
    canonicalLatitude: 38.42, canonicalLongitude: 27.13,
  };
  const prisma: any = {
    maintenanceVisit: {
      findUnique: async ({ where }: any) => where.idempotencyKey ? null : created[0],
      create: async ({ data }: any) => { const visit = { id: 'visit-1', ...data }; created.push(visit); return visit; },
    },
    point: { findFirst: async () => point },
    user: { findFirst: async () => ({ id: 'tech-1', active: true, role: UserRole.TECHNICIAN }) },
    maintenanceObligation: { findMany: async () => [{ id: 'obligation-1', status: MaintenanceObligationStatus.OPEN, dueStart: new Date('2026-09-01T00:00:00.000Z') }] },
    $transaction: async (fn: any) => fn({
      maintenanceVisit: prisma.maintenanceVisit,
      point: { update: async () => point },
      maintenanceObligation: { update: async () => ({}) , updateMany: async () => ({ count: 0 }) },
      adminAuditLog: { create: async () => ({}) },
    }),
  };
  return new MaintenanceService(
    prisma, {} as any,
    { ensureStandardObligations: async () => undefined } as any,
    { scanTechnician: async () => undefined } as any,
    { refreshPoint: async () => undefined } as any,
    { matchPoint: async () => undefined } as any,
    { effectiveForPoint: async () => ({ technicianId: 'tech-1' }) } as any,
  );
}

test('past-dated completion persists no GPS and skips location review/learning without changing completion', async () => {
  const created: any[] = [];
  const service = makeService(created);

  const result = await service.complete({
    pointId: 'point-1', technicianId: 'tech-1', performedAt: '2026-09-18T12:00:00.000Z',
    lateEntryReason: 'Dünkü bakım internet kesintisi nedeniyle bugün girildi',
    coolerCount: 1, towerCount: 0, tapCount: 0, smarttapCount: 0, equipmentConfirmed: true,
    idempotencyKey: 'past-date-without-gps',
  } as any);

  assert.equal((result as any).status, VisitStatus.VALID);
  assert.equal(created[0].latitude, null);
  assert.equal(created[0].longitude, null);
  assert.equal(created[0].locationCapturedAt, null);
  assert.equal(created[0].locationLearningEligible, false);
  assert.equal(created[0].locationReviewRequired, false);
  assert.equal(created[0].reviewRecommended, false);
  assert.match(created[0].reviewReason, /GERİYE DÖNÜK GİRİŞ/);
});

test('past-dated completion rejects every GPS metadata field', async () => {
  const service = makeService([]);
  await assert.rejects(() => service.complete({
    pointId: 'point-1', technicianId: 'tech-1', performedAt: '2026-09-18T12:00:00.000Z',
    lateEntryReason: 'Dünkü bakım internet kesintisi nedeniyle bugün girildi', accuracyMeters: 10,
    coolerCount: 1, towerCount: 0, tapCount: 0, smarttapCount: 0, equipmentConfirmed: true,
    idempotencyKey: 'past-date-with-accuracy',
  } as any), /Geriye dönük bakımda konum bilgisi kaydedilemez/);
});
