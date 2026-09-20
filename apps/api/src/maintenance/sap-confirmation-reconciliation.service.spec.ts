import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { ConfirmationApprovalSource, PaperworkStatus, SapImportSource } from '@prisma/client';

// RED: the reconciler must not exist until the fail-closed run/visit rules are implemented.
const loadService = () => require('./sap-confirmation-reconciliation.service').SapConfirmationReconciliationService;

test('does not reconcile a failed or dry-run SAP import', async () => {
  const prisma: any = {
    sapImportRun: { findFirst: async () => null },
  };
  const service = new (loadService())(prisma);
  assert.deepEqual(await service.reconcileNext(), { processed: false, reason: 'NO_SUCCESSFUL_IMPORT' });
});

test('reconciles only the exact point and business date, preserving manual approval', async () => {
  const run = { id: 'run-1', source: SapImportSource.MAIN_CONFIRMATION_203, windowStart: new Date('2026-09-14T00:00:00Z'), windowEnd: new Date('2026-09-16T00:00:00Z'), completedAt: new Date('2026-09-17T00:00:00Z'), claimedAt: null, reconciledAt: null };
  const updates: any[] = [];
  const audits: any[] = [];
  const visits = [
    { id: 'missing', performedAt: new Date('2026-09-15T10:00:00Z'), coolerCount: 2, confirmationStatus: PaperworkStatus.PENDING, confirmationApprovalSource: null, point: { code: 'A-1' } },
    { id: 'manual', performedAt: new Date('2026-09-15T10:00:00Z'), coolerCount: 1, confirmationStatus: PaperworkStatus.APPROVED, confirmationApprovalSource: ConfirmationApprovalSource.MANUAL_ADMIN, point: { code: 'A-1' } },
  ];
  const tx: any = {
    maintenanceVisit: { findMany: async () => visits, update: async (input: any) => { updates.push(input); return input; } },
    sapConfirmation: { findMany: async () => [
      { pointCode: 'A-1', recordDate: new Date('2026-09-15T00:00:00Z'), status: '*Onay Bekliyor' },
      { pointCode: 'OTHER', recordDate: new Date('2026-09-15T00:00:00Z'), status: 'Tamamlandı' },
    ] },
    sapConfirmationReconciliation: { create: async (input: any) => { audits.push(input); return input; } },
    sapImportRun: { update: async () => ({}) },
  };
  const prisma: any = {
    sapImportRun: {
      findFirst: async () => run,
      updateMany: async () => ({ count: 1 }),
      update: async () => ({}),
    },
    $transaction: async (fn: any) => fn(tx),
  };
  const service = new (loadService())(prisma);
  assert.deepEqual(await service.reconcileNext(), { processed: true, importRunId: 'run-1', updated: 1 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.id, 'missing');
  assert.equal(updates[0].data.confirmationStatus, PaperworkStatus.MISSING);
  assert.equal(audits[0].data.sapCount, 1);
  assert.equal(audits[0].data.coolerCount, 2);
});
