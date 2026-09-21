import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MaintenanceObligationStatus, MaintenanceType, PointStatus, UserRole, VisitStatus,
} from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

const now = new Date('2026-09-21T12:00:00.000Z');

function makeHarness() {
  const visits: any[] = [];
  const obligationUpdates: any[] = [];
  const locationCalls: string[] = [];
  const point = {
    id: 'point-1', status: PointStatus.ACTIVE, maintenanceType: MaintenanceType.STANDARD,
    coolerCount: 1, towerCount: 0, tapCount: 0, smarttapCount: 0,
    canonicalLatitude: 38.42, canonicalLongitude: 27.13,
  };
  const prisma: any = {
    maintenanceVisit: {
      findUnique: async ({ where }: any) => where.idempotencyKey
        ? visits.find((visit) => visit.idempotencyKey === where.idempotencyKey) ?? null
        : visits[0],
      create: async ({ data }: any) => {
        const visit = { id: `visit-${visits.length + 1}`, ...data };
        visits.push(visit);
        return visit;
      },
    },
    point: { findFirst: async () => point },
    user: { findFirst: async () => ({ id: 'tech-1', active: true, role: UserRole.TECHNICIAN }) },
    maintenanceObligation: {
      findMany: async () => [{
        id: 'obligation-1', status: MaintenanceObligationStatus.OPEN,
        dueStart: new Date('2026-09-01T00:00:00.000Z'),
      }],
    },
    $transaction: async (fn: any) => fn({
      maintenanceVisit: prisma.maintenanceVisit,
      point: { update: async () => point },
      maintenanceObligation: {
        update: async ({ data }: any) => { obligationUpdates.push(data); return data; },
        updateMany: async () => ({ count: 0 }),
      },
      adminAuditLog: { create: async ({ data }: any) => data },
    }),
  };
  const service = new MaintenanceService(
    prisma, {} as any,
    { ensureStandardObligations: async () => undefined } as any,
    { scanTechnician: async () => { locationCalls.push('scanTechnician'); } } as any,
    { refreshPoint: async () => { locationCalls.push('refreshPoint'); } } as any,
    { matchPoint: async () => { locationCalls.push('matchPoint'); } } as any,
    { effectiveForPoint: async () => ({ technicianId: 'tech-1' }) } as any,
  );
  return { service, visits, obligationUpdates, locationCalls };
}
function currentMismatchRequest(locationPresenceConfirmed: boolean, key: string) {
  return {
    pointId: 'point-1', technicianId: 'tech-1', performedAt: now.toISOString(),
    latitude: 38.4236, longitude: 27.13, accuracyMeters: 27,
    locationCapturedAt: '2026-09-21T11:59:30.000Z',
    deviceRecordedAt: now.toISOString(), locationPresenceConfirmed,
    coolerCount: 1, towerCount: 0, tapCount: 0, smarttapCount: 0,
    equipmentConfirmed: true, idempotencyKey: key,
  };
}

test('Evet mismatch saves a completed valid maintenance record and may evaluate location', async () => {
  const harness = makeHarness();
  const result = await harness.service.complete(
    currentMismatchRequest(true, 'location-here') as any, now,
  );

  assert.equal((result as any).status, VisitStatus.VALID);
  assert.equal(harness.visits[0].locationPresenceConfirmed, true);
  assert.equal(harness.visits[0].locationReviewRequired, true);
  assert.equal(harness.obligationUpdates[0].status, MaintenanceObligationStatus.COMPLETED);
  assert.deepEqual(harness.locationCalls, ['scanTechnician', 'refreshPoint', 'matchPoint']);
});
test('Hayır mismatch saves completed maintenance but never enters GPS learning', async () => {
  const harness = makeHarness();
  const result = await harness.service.complete(
    currentMismatchRequest(false, 'location-not-here') as any, now,
  );

  assert.equal((result as any).status, VisitStatus.VALID);
  assert.equal(harness.visits[0].locationPresenceConfirmed, false);
  assert.equal(harness.visits[0].locationLearningEligible, false);
  assert.equal(harness.visits[0].locationReviewRequired, false);
  assert.equal(harness.obligationUpdates[0].status, MaintenanceObligationStatus.COMPLETED);
  assert.equal(harness.locationCalls.includes('refreshPoint'), false);
});
