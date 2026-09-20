import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { PaperworkKind, PaperworkStatus, UserRole, VisitStatus } from '@prisma/client';

const loadService = () => require('./maintenance.service').MaintenanceService;

test('manual confirmation approval records the immutable MANUAL_ADMIN source', async () => {
  const writes: any[] = [];
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => ({ id: 'visit-1', status: VisitStatus.VALID, serviceSlipStatus: PaperworkStatus.PENDING, confirmationStatus: PaperworkStatus.MISSING }) },
    user: { findFirst: async () => ({ id: 'admin-1', role: UserRole.ADMIN }) },
    $transaction: async (fn: any) => fn({
      maintenanceVisit: { update: async (input: any) => { writes.push(input); return input.data; } },
      paperworkStatusHistory: { create: async () => ({}) },
    }),
  };
  const service = new (loadService())(prisma, {}, {}, {}, {}, {}, {});
  await service.updatePaperwork({ visitId: 'visit-1', adminUserId: 'admin-1', kind: PaperworkKind.CONFIRMATION, status: PaperworkStatus.APPROVED });
  assert.equal(writes[0].data.confirmationStatus, PaperworkStatus.APPROVED);
  assert.equal(writes[0].data.confirmationApprovalSource, 'MANUAL_ADMIN');
});

test('a later manual confirmation change clears the SAP/manual approval source', async () => {
  const writes: any[] = [];
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => ({ id: 'visit-1', status: VisitStatus.VALID, serviceSlipStatus: PaperworkStatus.PENDING, confirmationStatus: PaperworkStatus.APPROVED }) },
    user: { findFirst: async () => ({ id: 'admin-1', role: UserRole.ADMIN }) },
    $transaction: async (fn: any) => fn({
      maintenanceVisit: { update: async (input: any) => { writes.push(input); return input.data; } },
      paperworkStatusHistory: { create: async () => ({}) },
    }),
  };
  const service = new (loadService())(prisma, {}, {}, {}, {}, {}, {});
  await service.updatePaperwork({ visitId: 'visit-1', adminUserId: 'admin-1', kind: PaperworkKind.CONFIRMATION, status: PaperworkStatus.MISSING });
  assert.equal(writes[0].data.confirmationApprovalSource, null);
});
