import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import {
  MaintenanceObligationStatus,
  MaintenanceType,
  PaperworkStatus,
  PointStatus,
  UserRole,
} from '@prisma/client';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceService } from './maintenance.service';

const NOW = new Date('2035-01-10T12:00:00.000Z');
const PERFORMED_AT = '2035-01-08T09:30:00.000Z';
const DEVICE_RECORDED_AT = '2035-01-08T09:31:00.000Z';
const POINT_ID = '11111111-1111-4111-8111-111111111111';
const TECHNICIAN_ID = '22222222-2222-4222-8222-222222222222';

function mobilePayload(overrides: Record<string, unknown> = {}) {
  return {
    pointId: POINT_ID,
    performedAt: PERFORMED_AT,
    deviceRecordedAt: DEVICE_RECORDED_AT,
    lateEntryReason: 'Çevrimdışı bakım kaydı',
    coolerCount: 5,
    maintainedCoolerCount: 4,
    partialMaintenanceConfirmed: true,
    towerCount: 0,
    tapCount: 0,
    smarttapCount: 0,
    equipmentConfirmed: true,
    idempotencyKey: 'mobile-partial-maintenance-contract',
    ...overrides,
  };
}

async function validateMobilePayload(payload: Record<string, unknown>) {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  return pipe.transform(payload, {
    type: 'body',
    metatype: CompleteMaintenanceDto,
    data: '',
  }) as Promise<CompleteMaintenanceDto>;
}

function makeHarness() {
  const audits: any[] = [];
  const point = {
    id: POINT_ID,
    status: PointStatus.ACTIVE,
    maintenanceType: MaintenanceType.STANDARD,
    coolerCount: 5,
    towerCount: 0,
    tapCount: 0,
    smarttapCount: 0,
    canonicalLatitude: 38.42,
    canonicalLongitude: 27.13,
  };
  const obligation: any = {
    id: 'obligation-1',
    pointId: POINT_ID,
    status: MaintenanceObligationStatus.OPEN,
    dueStart: new Date('2035-01-01T00:00:00.000Z'),
    completedAt: null,
    resolvedAt: null,
    resolvedByVisitId: null,
  };
  let visit: any = null;

  const maintenanceVisit = {
    findUnique: async ({ where }: any) => {
      if (where.idempotencyKey) return visit?.idempotencyKey === where.idempotencyKey ? visit : null;
      return visit?.id === where.id ? visit : null;
    },
    findMany: async () => visit ? [visit] : [],
    create: async ({ data }: any) => {
      visit = {
        id: 'visit-1',
        recordedAtServer: NOW,
        serviceSlipStatus: PaperworkStatus.PENDING,
        confirmationStatus: PaperworkStatus.PENDING,
        point: {
          id: POINT_ID,
          code: 'P1',
          name: 'Sözleşme Noktası',
          maintenanceType: MaintenanceType.STANDARD,
        },
        assistedForTechnicianId: null,
        assistedForTechnician: null,
        ...data,
      };
      return visit;
    },
  };

  const prisma: any = {
    maintenanceVisit,
    point: { findFirst: async () => point },
    user: {
      findFirst: async () => ({
        id: TECHNICIAN_ID,
        active: true,
        role: UserRole.TECHNICIAN,
      }),
    },
    maintenanceObligation: {
      findMany: async () => obligation.status === MaintenanceObligationStatus.OPEN ? [obligation] : [],
    },
    maintenanceAttempt: { findMany: async () => [] },
    nonMaintenanceVisit: { findMany: async () => [] },
    prospectVisit: { findMany: async () => [] },
    $transaction: async (fn: any) => fn({
      maintenanceVisit,
      point: { update: async () => point },
      maintenanceObligation: {
        updateMany: async () => ({ count: 0 }),
        update: async ({ data }: any) => {
          Object.assign(obligation, data);
          return obligation;
        },
      },
      adminAuditLog: {
        create: async ({ data }: any) => {
          audits.push(data);
          return data;
        },
      },
    }),
  };

  const service = new MaintenanceService(
    prisma,
    {} as any,
    { ensureStandardObligations: async () => undefined } as any,
    { scanTechnician: async () => undefined } as any,
    { refreshPoint: async () => undefined } as any,
    { matchPoint: async () => undefined } as any,
    { effectiveForPoint: async () => ({ technicianId: TECHNICIAN_ID }) } as any,
  );

  return {
    audits,
    obligation,
    get visit() { return visit; },
    completeFromMobile: async (payload: Record<string, unknown>) => {
      const dto = await validateMobilePayload(payload);
      return (service.complete as unknown as (
        input: CompleteMaintenanceDto,
        now: Date,
      ) => Promise<any>)({ ...dto, technicianId: TECHNICIAN_ID }, NOW);
    },
    history: () => service.technicianHistory(TECHNICIAN_ID, '2035-01-08', NOW),
  };
}

test('mobile partial payload with an explanation passes the API whitelist and reaches audit and history', async () => {
  const harness = makeHarness();
  const payload = mobilePayload({ missingMaintenanceExplanation: 'Bir ünite kapalıydı' });

  const result = await harness.completeFromMobile(payload);
  const history = await harness.history();

  assert.equal(result.id, 'visit-1');
  assert.equal(harness.visit.technicianId, TECHNICIAN_ID);
  assert.equal(harness.visit.performedAt.toISOString(), PERFORMED_AT);
  assert.equal(harness.visit.deviceRecordedAt.toISOString(), DEVICE_RECORDED_AT);
  assert.equal(harness.visit.totalCoolerCount, 5);
  assert.equal(harness.visit.maintainedCoolerCount, 4);
  assert.equal(harness.visit.missingMaintenanceCount, 1);
  assert.equal(harness.visit.missingMaintenanceExplanation, 'Bir ünite kapalıydı');
  assert.equal(harness.obligation.status, MaintenanceObligationStatus.COMPLETED);
  assert.equal(harness.obligation.resolvedByVisitId, 'visit-1');
  assert.equal(
    harness.audits.at(-1).action,
    'MAINTENANCE_PARTIAL_COOLER_COUNT_RECORDED',
  );
  assert.deepEqual(harness.audits.at(-1).newValue, {
    totalCoolerCount: 5,
    maintainedCoolerCount: 4,
    missingMaintenanceCount: 1,
    missingMaintenanceExplanation: 'Bir ünite kapalıydı',
  });
  assert.equal(
    (history.items[0] as any).maintenanceSummary,
    '4/5 soğutucu bakım · 1 eksik',
  );
});

test('mobile partial payload without the optional explanation still closes and summarizes the obligation', async () => {
  const harness = makeHarness();

  await harness.completeFromMobile(mobilePayload());
  const history = await harness.history();

  assert.equal(harness.visit.missingMaintenanceExplanation, null);
  assert.equal(harness.obligation.status, MaintenanceObligationStatus.COMPLETED);
  assert.equal(
    (history.items[0] as any).maintenanceSummary,
    '4/5 soğutucu bakım · 1 eksik',
  );
});

test('normal maintenance keeps its complete counts, closure and audit contract', async () => {
  const harness = makeHarness();

  await harness.completeFromMobile(mobilePayload({
    maintainedCoolerCount: 5,
    partialMaintenanceConfirmed: undefined,
    idempotencyKey: 'mobile-normal-maintenance-contract',
  }));
  const history = await harness.history();

  assert.equal(harness.visit.totalCoolerCount, 5);
  assert.equal(harness.visit.maintainedCoolerCount, 5);
  assert.equal(harness.visit.missingMaintenanceCount, 0);
  assert.equal(harness.visit.missingMaintenanceExplanation, null);
  assert.equal(harness.obligation.status, MaintenanceObligationStatus.COMPLETED);
  assert.equal(harness.audits.at(-1).action, 'MAINTENANCE_COOLER_COUNT_RECORDED');
  assert.equal(
    (history.items[0] as any).maintenanceSummary,
    '5/5 soğutucu bakım',
  );
});
