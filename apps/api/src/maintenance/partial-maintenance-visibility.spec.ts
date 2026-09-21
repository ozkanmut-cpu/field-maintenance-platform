import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MaintenanceService } from './maintenance.service';
import { PointTimelineService } from './point-timeline.service';

const partialCounts = {
  totalCoolerCount: 5,
  maintainedCoolerCount: 4,
  missingMaintenanceCount: 1,
  missingMaintenanceExplanation: 'Bir ünite kapalıydı',
};

test('technician history selects and returns partial maintenance evidence', async () => {
  let visitQuery: any;
  const prisma: any = {
    user: { findFirst: async () => ({ id: 'tech-1', active: true, role: 'TECHNICIAN' }) },
    maintenanceVisit: {
      findMany: async (query: any) => {
        visitQuery = query;
        return [{
          id: 'visit-1',
          performedAt: new Date('2026-09-20T09:00:00.000Z'),
          recordedAtServer: new Date('2026-09-20T09:05:00.000Z'),
          enteredLate: false,
          assistedForTechnicianId: null,
          assistedForTechnician: null,
          serviceSlipStatus: 'PENDING',
          confirmationStatus: 'PENDING',
          point: { id: 'point-1', code: 'P1', name: 'Nokta', maintenanceType: 'STANDARD' },
          ...partialCounts,
        }];
      },
    },
    maintenanceAttempt: { findMany: async () => [] },
    nonMaintenanceVisit: { findMany: async () => [] },
    prospectVisit: { findMany: async () => [] },
  };
  const service = new MaintenanceService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const result = await service.technicianHistory('tech-1', '2026-09-20');

  for (const field of Object.keys(partialCounts)) assert.equal(visitQuery.select[field], true);
  assert.deepEqual(result.items[0], {
    type: 'MAINTENANCE',
    at: new Date('2026-09-20T09:00:00.000Z'),
    id: 'visit-1',
    performedAt: new Date('2026-09-20T09:00:00.000Z'),
    recordedAtServer: new Date('2026-09-20T09:05:00.000Z'),
    revertEligible: true,
    enteredLate: false,
    assistedForTechnicianId: null,
    assistedForTechnician: null,
    serviceSlipStatus: 'PENDING',
    confirmationStatus: 'PENDING',
    point: { id: 'point-1', code: 'P1', name: 'Nokta', maintenanceType: 'STANDARD' },
    ...partialCounts,
    maintenanceSummary: '4/5 soğutucu bakım · 1 eksik',
  });
});

test('default technician history includes maintenance entered yesterday and marks it revertable', async () => {
  let visitQuery: any;
  const prisma: any = {
    user: { findFirst: async () => ({ id: 'tech-1', active: true, role: 'TECHNICIAN' }) },
    maintenanceVisit: {
      findMany: async (query: any) => {
        visitQuery = query;
        return [{
          id: 'visit-yesterday',
          performedAt: new Date('2026-09-14T09:00:00.000Z'),
          recordedAtServer: new Date('2026-09-19T20:59:59.000Z'),
          enteredLate: true, assistedForTechnicianId: null, assistedForTechnician: null,
          serviceSlipStatus: 'PENDING', confirmationStatus: 'PENDING',
          point: { id: 'point-1', code: 'P1', name: 'Nokta', maintenanceType: 'STANDARD' },
        }];
      },
    },
    maintenanceAttempt: { findMany: async () => [] },
    nonMaintenanceVisit: { findMany: async () => [] },
    prospectVisit: { findMany: async () => [] },
  };
  const service = new MaintenanceService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

  const result = await service.technicianHistory('tech-1', undefined, new Date('2026-09-20T20:59:59.000Z'));

  assert.deepEqual(visitQuery.where.recordedAtServer, {
    gte: new Date('2026-09-18T21:00:00.000Z'),
    lt: new Date('2026-09-20T21:00:00.000Z'),
  });
  assert.equal((result.items[0] as any).revertEligible, true);
  assert.equal((result.items[0] as any).at.toISOString(), '2026-09-14T09:00:00.000Z');
});

test('point timeline selects and returns partial maintenance evidence', async () => {
  let visitQuery: any;
  const prisma: any = {
    point: { findFirst: async () => ({ id: 'point-1', code: 'P1', name: 'Nokta', maintenanceType: 'STANDARD', region: null }) },
    maintenanceVisit: {
      findMany: async (query: any) => {
        visitQuery = query;
        return [{
          id: 'visit-1',
          performedAt: new Date('2026-09-20T09:00:00.000Z'),
          recordedAtServer: new Date('2026-09-20T09:05:00.000Z'),
          status: 'VALID', enteredLate: false, serviceSlipStatus: 'PENDING', confirmationStatus: 'PENDING',
          reviewRecommended: false, reviewReason: null,
          coolerCount: 5, towerCount: 0, tapCount: 0, smarttapCount: 0,
          technician: { id: 'tech-1', name: 'Teknisyen', username: 'tech' },
          ...partialCounts,
        }];
      },
    },
    maintenanceAttempt: { findMany: async () => [] },
    nonMaintenanceVisit: { findMany: async () => [] },
    maintenanceObligation: { findMany: async () => [] },
    pointAssignment: { findMany: async () => [] },
  };
  const service = new PointTimelineService(prisma);

  const result = await service.get('point-1');

  for (const field of Object.keys(partialCounts)) assert.equal(visitQuery.select[field], true);
  assert.deepEqual((result.items[0] as any).data.missingMaintenanceExplanation, 'Bir ünite kapalıydı');
  assert.equal((result.items[0] as any).data.totalCoolerCount, 5);
  assert.equal((result.items[0] as any).data.maintainedCoolerCount, 4);
  assert.equal((result.items[0] as any).data.missingMaintenanceCount, 1);
});
