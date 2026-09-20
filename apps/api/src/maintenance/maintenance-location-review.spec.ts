import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  LocationSource,
  MaintenanceObligationStatus,
  PaperworkStatus,
  ReviewDecision,
  VisitStatus,
} from '@prisma/client';
import { MaintenanceAnomalyService } from './maintenance-anomaly.service';
import { MaintenanceService } from './maintenance.service';

function completedVisit() {
  return {
    id: 'visit-1', pointId: 'point-1', technicianId: 'tech-1', status: VisitStatus.VALID,
    obligationId: 'obligation-1', serviceSlipStatus: PaperworkStatus.PRESENT,
    confirmationStatus: PaperworkStatus.MISSING, performedAt: new Date('2026-09-18T08:00:00.000Z'),
    recordedAtServer: new Date('2026-09-18T08:05:00.000Z'), deviceRecordedAt: new Date('2026-09-18T07:59:00.000Z'),
    coolerCount: 2, towerCount: 1, tapCount: 4, smarttapCount: 3, equipmentConfirmed: true,
    latitude: '38.420001', longitude: '27.130001', accuracyMeters: '20',
    suspiciousBatch: true, enteredLate: false, locationPresenceConfirmed: true,
    locationLearningEligible: true, locationReviewRequired: true, reviewRecommended: true,
    obligation: {
      id: 'obligation-1', status: MaintenanceObligationStatus.COMPLETED,
      completedAt: new Date('2026-09-18T08:00:00.000Z'), resolvedAt: new Date('2026-09-18T08:00:00.000Z'),
      resolvedByVisitId: 'visit-1',
    },
    point: {
      id: 'point-1', canonicalLatitude: '38.410000', canonicalLongitude: '27.120000',
      locationSource: LocationSource.GOOGLE_MATCH, locationConfidence: 75,
      googlePlaceId: 'google-id', googleBusinessName: 'Google business',
    },
  };
}

function assertCompletionPreserved(updated: Record<string, unknown>, visit: ReturnType<typeof completedVisit>) {
  for (const key of [
    'status', 'obligationId', 'serviceSlipStatus', 'confirmationStatus',
    'performedAt', 'recordedAtServer', 'deviceRecordedAt', 'coolerCount',
    'towerCount', 'tapCount', 'smarttapCount', 'equipmentConfirmed',
  ]) {
    assert.equal(updated[key], visit[key as keyof typeof visit]);
  }
  assert.deepEqual(updated.obligation, visit.obligation);
}

test('admin approval promotes visit GPS to MANUAL canonical location, preserves Google metadata, and audits without clearing suspicious batch', async () => {
  const updates: any[] = [];
  const audits: any[] = [];
  const visit = {
    id: 'visit-1', pointId: 'point-1', technicianId: 'tech-1', status: VisitStatus.VALID,
    latitude: '38.420001', longitude: '27.130001', accuracyMeters: '20',
    suspiciousBatch: true, enteredLate: false, locationPresenceConfirmed: true,
    point: {
      id: 'point-1', canonicalLatitude: '38.410000', canonicalLongitude: '27.120000',
      locationSource: LocationSource.GOOGLE_MATCH, locationConfidence: 75,
      googlePlaceId: 'google-id', googleBusinessName: 'Google business',
    },
  };
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: 'admin-1', role: 'ADMIN', active: true }) },
    $transaction: async (fn: any) => fn({
      point: { update: async (args: any) => { updates.push(args); return { id: 'point-1', ...args.data }; } },
      maintenanceVisit: { update: async (args: any) => ({ ...visit, ...args.data }) },
      adminAuditLog: { create: async (args: any) => { audits.push(args); return args.data; } },
    }),
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  const result = await service.approveVisitLocation('admin-1', { visitId: 'visit-1', note: 'Sahada doğrulandı' });

  assert.equal(updates[0].data.locationSource, LocationSource.MANUAL);
  assert.equal(updates[0].data.locationConfidence, 100);
  assert.equal(String(updates[0].data.canonicalLatitude), '38.420001');
  assert.equal(audits[0].data.action, 'POINT_LOCATION_CONFIRMED_FROM_VISIT');
  assert.equal(audits[0].data.newValue.googlePlaceId, undefined);
  assert.equal(result.visit.suspiciousBatch, true);
});

test('closing a location-only review clears its location queue flag without promoting learning', async () => {
  const updates: any[] = [];
  const visit = {
    id: 'visit-1', status: VisitStatus.VALID, enteredLate: false,
    suspiciousBatch: false, locationLearningEligible: false, locationReviewRequired: true,
  };
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: 'admin-1', role: 'ADMIN', active: true }) },
    $transaction: async (fn: any) => fn({
      maintenanceVisit: { update: async (args: any) => { updates.push(args); return { ...visit, ...args.data }; } },
      maintenanceReviewResolution: { create: async (args: any) => args.data },
    }),
  };
  const service = new MaintenanceAnomalyService(prisma, {} as never);

  await service.resolveReview({ visitId: 'visit-1', adminUserId: 'admin-1', decision: ReviewDecision.NO_ISSUE });

  assert.equal(updates[0].data.locationReviewRequired, false);
  assert.equal(updates[0].data.locationLearningEligible, false);
});

test('a past-dated maintenance visit cannot be promoted into an official point location', async () => {
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => ({
      id: 'past-visit', pointId: 'point-1', status: VisitStatus.VALID, enteredLate: true,
      latitude: null, longitude: null, suspiciousBatch: false,
      point: { id: 'point-1', canonicalLatitude: null, canonicalLongitude: null, locationSource: LocationSource.UNKNOWN, locationConfidence: 0 },
    }) },
    user: { findFirst: async () => ({ id: 'admin-1', role: 'ADMIN', active: true }) },
    $transaction: async () => assert.fail('past dated location approval must not mutate a point'),
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  await assert.rejects(() => service.approveVisitLocation('admin-1', { visitId: 'past-visit' }), BadRequestException);
});

test('location approval cannot replace a completed maintenance approval', async () => {
  const visit = completedVisit();
  const visitUpdates: any[] = [];
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: 'admin-1', role: 'ADMIN', active: true }) },
    $transaction: async (fn: any) => fn({
      point: { update: async (args: any) => ({ id: visit.pointId, ...args.data }) },
      maintenanceVisit: {
        update: async (args: any) => {
          visitUpdates.push(args);
          return { ...visit, ...args.data };
        },
      },
      maintenanceObligation: { update: async () => assert.fail('location approval must not alter obligation completion') },
      adminAuditLog: { create: async (args: any) => args.data },
    }),
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  const result = await service.approveVisitLocation('admin-1', { visitId: visit.id });

  assertCompletionPreserved(result.visit, visit);
  assert.deepEqual(visitUpdates[0].data, {
    locationReviewRequired: false,
    reviewRecommended: true,
  });
});

for (const decision of [ReviewDecision.NO_ISSUE, ReviewDecision.KEEP_LOCATION_EXCLUDED]) {
  test(`${decision} review resolution preserves the completed maintenance approval`, async () => {
    const visit = completedVisit();
    const visitUpdates: any[] = [];
    const prisma: any = {
      maintenanceVisit: { findUnique: async () => visit },
      user: { findFirst: async () => ({ id: 'admin-1', role: 'ADMIN', active: true }) },
      $transaction: async (fn: any) => fn({
        maintenanceVisit: {
          update: async (args: any) => {
            visitUpdates.push(args);
            return { ...visit, ...args.data };
          },
        },
        maintenanceObligation: { update: async () => assert.fail('review resolution must not alter obligation completion') },
        maintenanceReviewResolution: { create: async (args: any) => args.data },
      }),
    };
    const service = new MaintenanceAnomalyService(prisma, {} as never);

    const result = await service.resolveReview({ visitId: visit.id, adminUserId: 'admin-1', decision });

    assertCompletionPreserved(result.visit, visit);
    assert.equal(visitUpdates[0].data.status, undefined);
    assert.equal(visitUpdates[0].data.obligationId, undefined);
  });
}

test('location approval and each closing review resolution reject a reversed visit', async () => {
  const reversed = { ...completedVisit(), status: VisitStatus.REVERSED };
  const approvalPrisma: any = {
    maintenanceVisit: { findUnique: async () => reversed },
    user: { findFirst: async () => ({ id: 'admin-1', role: 'ADMIN', active: true }) },
    $transaction: async () => assert.fail('reversed location approval must not start a transaction'),
  };
  const reviewPrisma: any = {
    maintenanceVisit: { findUnique: async () => reversed },
    user: { findFirst: async () => ({ id: 'admin-1', role: 'ADMIN', active: true }) },
    $transaction: async () => assert.fail('reversed review resolution must not start a transaction'),
  };
  const approval = new MaintenanceService(approvalPrisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const review = new MaintenanceAnomalyService(reviewPrisma, {} as never);

  await assert.rejects(
    () => approval.approveVisitLocation('admin-1', { visitId: reversed.id }),
    BadRequestException,
  );
  for (const decision of [ReviewDecision.NO_ISSUE, ReviewDecision.KEEP_LOCATION_EXCLUDED]) {
    await assert.rejects(
      () => review.resolveReview({ visitId: reversed.id, adminUserId: 'admin-1', decision }),
      BadRequestException,
    );
  }
});
