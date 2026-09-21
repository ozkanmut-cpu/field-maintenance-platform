import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserRole } from '@prisma/client';
import { MaintenanceController } from './maintenance.controller';

test('technician history returns one enriched customerless non-maintenance visit', async () => {
  const visitedAt = new Date('2026-09-21T09:30:00.000Z');
  const duplicateBaseItem = {
    id: 'visit-1',
    type: 'NON_MAINTENANCE_VISIT' as const,
    at: visitedAt,
    visitedAt,
    purpose: 'BREAKDOWN',
    point: null,
  };
  const maintenance = {
    technicianHistory: async () => ({
      date: '2026-09-21',
      maintenanceCount: 0,
      attemptCount: 0,
      nonMaintenanceVisitCount: 1,
      prospectVisitCount: 0,
      totalOperations: 1,
      items: [duplicateBaseItem],
    }),
  };
  const nonMaintenanceVisits = {
    technicianHistory: async () => ({
      count: 1,
      items: [{
        id: 'visit-1',
        visitedAt,
        purpose: 'BREAKDOWN',
        purposeLabel: 'Arıza',
        customerName: 'Kayıtsız Müşteri',
        historyLabel: 'Kayıtsız Müşteri · Arıza',
        point: null,
      }],
    }),
  };
  const controller = new MaintenanceController(
    maintenance as any,
    {} as any,
    {} as any,
    {} as any,
    nonMaintenanceVisits as any,
    {} as any,
  );

  const result = await controller.technicianHistory(
    { id: 'tech-1', role: UserRole.TECHNICIAN } as any,
    undefined,
    '2026-09-21',
  );

  assert.equal(result.totalOperations, 1);
  assert.equal(result.nonMaintenanceVisitCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 'visit-1');
  assert.equal((result.items[0] as any).customerName, 'Kayıtsız Müşteri');
  assert.equal((result.items[0] as any).historyLabel, 'Kayıtsız Müşteri · Arıza');
});
