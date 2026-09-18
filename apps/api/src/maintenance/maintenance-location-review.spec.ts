import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LocationSource, VisitStatus } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

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
