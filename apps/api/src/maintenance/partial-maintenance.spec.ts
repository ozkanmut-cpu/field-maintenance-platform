import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MaintenanceObligationStatus,
  MaintenanceType,
  PaperworkStatus,
  PointStatus,
  UserRole,
} from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

const TEST_NOW = new Date('2035-01-10T12:00:00.000Z');
const TEST_PERFORMED_AT = '2035-01-08T12:00:00.000Z';

function makeService(
  pointCoolerCount: number | null = 5,
  pointEquipment: Partial<{
    towerCount: number | null;
    tapCount: number | null;
    smarttapCount: number | null;
  }> = {},
) {
  const created: any[] = [];
  const audits: any[] = [];
  const pointUpdates: any[] = [];
  const point = {
    id: 'point-1',
    status: PointStatus.ACTIVE,
    maintenanceType: MaintenanceType.STANDARD,
    coolerCount: pointCoolerCount,
    towerCount: pointEquipment.towerCount ?? 0,
    tapCount: pointEquipment.tapCount ?? 0,
    smarttapCount: pointEquipment.smarttapCount ?? 0,
    ...pointEquipment,
    canonicalLatitude: 38.42,
    canonicalLongitude: 27.13,
  };
  const prisma: any = {
    maintenanceVisit: {
      findUnique: async ({ where }: any) => where.idempotencyKey ? null : created[0],
      create: async ({ data }: any) => {
        const visit = {
          id: `visit-${created.length + 1}`,
          confirmationStatus: PaperworkStatus.PENDING,
          ...data,
        };
        created.push(visit);
        return visit;
      },
    },
    point: { findFirst: async () => point },
    user: { findFirst: async () => ({ id: 'tech-1', active: true, role: UserRole.TECHNICIAN }) },
    maintenanceObligation: {
      findMany: async () => [{
        id: 'obligation-1',
        status: MaintenanceObligationStatus.OPEN,
        dueStart: new Date('2026-09-01T00:00:00.000Z'),
      }],
    },
    $transaction: async (fn: any) => fn({
      maintenanceVisit: prisma.maintenanceVisit,
      point: { update: async ({ data }: any) => { pointUpdates.push(data); return { ...point, ...data }; } },
      maintenanceObligation: { update: async () => ({}), updateMany: async () => ({ count: 0 }) },
      adminAuditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
    }),
  };
  const maintenanceService = new MaintenanceService(
    prisma,
    {} as any,
    { ensureStandardObligations: async () => undefined } as any,
    { scanTechnician: async () => undefined } as any,
    { refreshPoint: async () => undefined } as any,
    { matchPoint: async () => undefined } as any,
    { effectiveForPoint: async () => ({ technicianId: 'tech-1' }) } as any,
  );
  return {
    created,
    audits,
    pointUpdates,
    service: {
      complete: (dto: any) => (
        maintenanceService.complete as unknown as (input: any, now: Date) => Promise<any>
      )(dto, TEST_NOW),
    },
  };
}

function completionInput(overrides: Record<string, unknown> = {}) {
  return {
    pointId: 'point-1',
    technicianId: 'tech-1',
    performedAt: TEST_PERFORMED_AT,
    lateEntryReason: 'Dünkü bakım internet kesintisi nedeniyle bugün girildi',
    coolerCount: 5,
    towerCount: 0,
    tapCount: 0,
    smarttapCount: 0,
    equipmentConfirmed: true,
    idempotencyKey: `partial-maintenance-${Math.random()}`,
    ...overrides,
  } as any;
}

test('records missing maintenance independently from missing confirmation', async () => {
  const { service, audits } = makeService(5);

  const visit = await service.complete(completionInput({
    maintainedCoolerCount: 4,
    partialMaintenanceConfirmed: true,
    missingMaintenanceExplanation: 'Bir ünite kapalıydı',
  }));

  assert.equal((visit as any).totalCoolerCount, 5);
  assert.equal((visit as any).maintainedCoolerCount, 4);
  assert.equal((visit as any).missingMaintenanceCount, 1);
  assert.equal((visit as any).missingMaintenanceExplanation, 'Bir ünite kapalıydı');
  assert.equal((visit as any).confirmationStatus, PaperworkStatus.PENDING);
  assert.equal(audits.at(-1).actorId, 'tech-1');
  assert.equal(audits.at(-1).entityType, 'MAINTENANCE_VISIT');
  assert.equal(audits.at(-1).entityId, (visit as any).id);
  assert.equal(audits.at(-1).action, 'MAINTENANCE_PARTIAL_COOLER_COUNT_RECORDED');
  assert.deepEqual(audits.at(-1).newValue, {
    totalCoolerCount: 5,
    maintainedCoolerCount: 4,
    missingMaintenanceCount: 1,
    missingMaintenanceExplanation: 'Bir ünite kapalıydı',
  });
  assert.equal(audits.at(-1).note, 'Eksik bakım teknisyen tarafından tamamlanmış olarak kaydedildi');
});

test('rejects maintained cooler count above the immutable completion total', async () => {
  const { service } = makeService(5);

  await assert.rejects(
    () => service.complete(completionInput({ maintainedCoolerCount: 6 })),
    /Bakımı yapılan soğutucu adedi toplam soğutucu adedinden büyük olamaz/,
  );
});

test('allows incomplete maintenance without an explanation when the technician explicitly records it', async () => {
  const { service } = makeService(5);

  const visit = await service.complete(completionInput({
    maintainedCoolerCount: 4,
    partialMaintenanceConfirmed: true,
    missingMaintenanceExplanation: '',
  }));

  assert.equal((visit as any).missingMaintenanceCount, 1);
  assert.equal((visit as any).missingMaintenanceExplanation, null);
});

test('rejects a partial maintenance record until the technician explicitly acknowledges the shortfall', async () => {
  const { service } = makeService(5);

  await assert.rejects(
    () => service.complete(completionInput({ maintainedCoolerCount: 4 })),
    /eksik bakım yapıldı/i,
  );
});

test('rejects a partial maintenance record when the technician explicitly declines the shortfall acknowledgement', async () => {
  const { service } = makeService(5);

  await assert.rejects(
    () => service.complete(completionInput({ maintainedCoolerCount: 4, partialMaintenanceConfirmed: false })),
    /eksik bakım yapıldı/i,
  );
});

test('uses an existing point cooler count as the immutable total while applying an explicit equipment correction', async () => {
  const { service, pointUpdates } = makeService(5);

  const visit = await service.complete(completionInput({
    coolerCount: 4,
    maintainedCoolerCount: 4,
    equipmentCorrectionRequested: true,
    partialMaintenanceConfirmed: true,
  }));

  assert.equal((visit as any).totalCoolerCount, 5);
  assert.equal((visit as any).maintainedCoolerCount, 4);
  assert.equal((visit as any).missingMaintenanceCount, 1);
  assert.equal(pointUpdates[0].coolerCount, 4);
});

test('rejects an equipment correction that was not explicitly requested', async () => {
  const { service } = makeService(5);

  await assert.rejects(
    () => service.complete(completionInput({ coolerCount: 4, maintainedCoolerCount: 4 })),
    /Ekipman sayısı değişikliğini ayrıca onayla/,
  );
});

test('bootstraps a missing tower count without equipment correction approval', async () => {
  const { service, pointUpdates } = makeService(5, { towerCount: null });

  const visit = await service.complete(completionInput({
    towerCount: 1,
    maintainedCoolerCount: 5,
  }));

  assert.equal((visit as any).totalCoolerCount, 5);
  assert.equal((visit as any).missingMaintenanceCount, 0);
  assert.equal(pointUpdates[0].coolerCount, 5);
  assert.equal(pointUpdates[0].towerCount, 1);
});

test('requires explicit equipment correction approval to change an existing tower count', async () => {
  const { service, pointUpdates } = makeService(5, { towerCount: 1 });

  await assert.rejects(
    () => service.complete(completionInput({ towerCount: 2, maintainedCoolerCount: 5 })),
    /Ekipman sayısı değişikliğini ayrıca onayla/,
  );

  const visit = await service.complete(completionInput({
    towerCount: 2,
    maintainedCoolerCount: 5,
    equipmentCorrectionRequested: true,
  }));

  assert.equal((visit as any).totalCoolerCount, 5);
  assert.equal(pointUpdates[0].towerCount, 2);
});

test('validates maintained count against the stored operational total even when a correction raises equipment count', async () => {
  const { service } = makeService(5);

  await assert.rejects(
    () => service.complete(completionInput({
      coolerCount: 6,
      maintainedCoolerCount: 6,
      equipmentCorrectionRequested: true,
    })),
    /Bakımı yapılan soğutucu adedi toplam soğutucu adedinden büyük olamaz/,
  );
});

test('bootstraps the immutable total from a submitted count only when the point has no cooler count', async () => {
  const { service, pointUpdates } = makeService(null);

  const visit = await service.complete(completionInput({
    coolerCount: 4,
    maintainedCoolerCount: 3,
    partialMaintenanceConfirmed: true,
  }));

  assert.equal((visit as any).totalCoolerCount, 4);
  assert.equal((visit as any).maintainedCoolerCount, 3);
  assert.equal((visit as any).missingMaintenanceCount, 1);
  assert.equal(pointUpdates[0].coolerCount, 4);
});

test('records zero coolers as a complete maintenance without a missing count', async () => {
  const { service } = makeService(0);

  const visit = await service.complete(completionInput({
    coolerCount: 0,
    maintainedCoolerCount: 0,
  }));

  assert.equal((visit as any).totalCoolerCount, 0);
  assert.equal((visit as any).maintainedCoolerCount, 0);
  assert.equal((visit as any).missingMaintenanceCount, 0);
});

test('treats an omitted maintained count from older clients as a complete maintenance', async () => {
  const { service } = makeService(5);

  const visit = await service.complete(completionInput({ maintainedCoolerCount: undefined }));

  assert.equal((visit as any).totalCoolerCount, 5);
  assert.equal((visit as any).maintainedCoolerCount, 5);
  assert.equal((visit as any).missingMaintenanceCount, 0);
});

test('clears a supplied explanation when all coolers were maintained', async () => {
  const { service } = makeService(5);

  const visit = await service.complete(completionInput({
    maintainedCoolerCount: 5,
    missingMaintenanceExplanation: 'Bu açıklama tam bakımda saklanmamalı',
  }));

  assert.equal((visit as any).missingMaintenanceCount, 0);
  assert.equal((visit as any).missingMaintenanceExplanation, null);
});
