import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { AttemptReason } from '@prisma/client';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceAttemptDto } from './dto/maintenance-attempt.dto';
import { MaintenanceService } from './maintenance.service';

const pointId = '11111111-1111-4111-8111-111111111111';
const technicianId = '22222222-2222-4222-8222-222222222222';

const completion = (): CompleteMaintenanceDto => ({
  pointId,
  technicianId,
  latitude: 38.423734,
  longitude: 27.142826,
  accuracyMeters: 12.5,
  locationPresenceConfirmed: true,
  locationCapturedAt: '2026-09-18T10:15:30.000Z',
  deviceRecordedAt: '2026-09-18T10:15:31.000Z',
  coolerCount: 2,
  towerCount: 1,
  tapCount: 4,
  smarttapCount: 0,
  equipmentConfirmed: true,
  idempotencyKey: 'maintenance-key-1',
});

const attempt = (): MaintenanceAttemptDto => ({
  pointId,
  technicianId,
  reason: AttemptReason.BUSINESS_CLOSED,
  note: 'Kapalı',
  latitude: 38.423734,
  longitude: 27.142826,
  accuracyMeters: 12.5,
  locationCapturedAt: '2026-09-18T10:15:30.000Z',
  idempotencyKey: 'attempt-key-1',
});

function makeService(existingVisit: any = null, existingAttempt: any = null) {
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => existingVisit },
    maintenanceAttempt: { findUnique: async () => existingAttempt },
  };
  return new MaintenanceService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
}

test('completion returns the prior result only when the repeated key has the same full request fingerprint', async () => {
  const existing = {
    id: 'visit-1',
    requestFingerprint: 'b1840dec37dd868cf1c9f2e97e74860c2d69becf88e4dd49a6727f442b722225',
  };
  const service = makeService(existing);

  assert.equal(await service.complete(completion()), existing);
  await assert.rejects(
    () => service.complete({ ...completion(), tapCount: 5 }),
    (error: unknown) => error instanceof ConflictException && /farklı bir bakım isteği/i.test(error.message),
  );
});

test('attempt returns the prior result only when the repeated key has the same full request fingerprint', async () => {
  const existing = {
    id: 'attempt-1',
    requestFingerprint: '41b6e0d74e99f1a6c2a690e2e23329b52a38a4ce90651ea52e04409e26fed031',
  };
  const service = makeService(null, existing);

  assert.equal(await service.recordAttempt(attempt()), existing);
  await assert.rejects(
    () => service.recordAttempt({ ...attempt(), reason: AttemptReason.ACCESS_FAILED }),
    (error: unknown) => error instanceof ConflictException && /farklı bir bakım denemesi/i.test(error.message),
  );
});

test('legacy rows without fingerprints accept only a semantically matching retry', async () => {
  const legacyAttempt = {
    id: 'attempt-legacy',
    requestFingerprint: null,
    pointId,
    technicianId,
    assistedForTechnicianId: null,
    reason: AttemptReason.BUSINESS_CLOSED,
    note: 'Kapalı',
    latitude: 38.423734,
    longitude: 27.142826,
    accuracyMeters: 12.5,
    locationCapturedAt: new Date('2026-09-18T10:15:30.000Z'),
  };
  const service = makeService(null, legacyAttempt);

  assert.equal(await service.recordAttempt(attempt()), legacyAttempt);
  await assert.rejects(
    () => service.recordAttempt({ ...attempt(), note: 'Farklı not' }),
    (error: unknown) => error instanceof ConflictException && /farklı bir bakım denemesi/i.test(error.message),
  );
});

test('legacy completion rows also reject materially different retry payloads', async () => {
  const legacyVisit = {
    id: 'visit-legacy',
    requestFingerprint: null,
    pointId,
    technicianId,
    assistedForTechnicianId: null,
    performedAt: new Date('2026-09-18T10:15:31.000Z'),
    latitude: 38.423734,
    longitude: 27.142826,
    accuracyMeters: 12.5,
    locationPresenceConfirmed: true,
    locationCapturedAt: new Date('2026-09-18T10:15:30.000Z'),
    deviceRecordedAt: new Date('2026-09-18T10:15:31.000Z'),
    lateEntryReason: null,
    coolerCount: 2,
    towerCount: 1,
    tapCount: 4,
    smarttapCount: 0,
    equipmentConfirmed: true,
  };
  const service = makeService(legacyVisit);

  assert.equal(await service.complete(completion()), legacyVisit);
  await assert.rejects(
    () => service.complete({ ...completion(), locationPresenceConfirmed: false }),
    (error: unknown) => error instanceof ConflictException && /farklı bir bakım isteği/i.test(error.message),
  );
});
