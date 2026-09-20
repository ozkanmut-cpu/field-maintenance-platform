import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PaperworkKind, UserRole, VisitStatus } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

test('admin confirmation approval records MANUAL_ADMIN source and audit atomically', async () => {
  const updates: any[] = [];
  const history: any[] = [];
  const audits: any[] = [];
  const visit = {
    id: '11111111-1111-4111-8111-111111111111',
    status: VisitStatus.VALID,
    confirmationStatus: 'MISSING',
    confirmationApprovalSource: null,
    serviceSlipStatus: 'PENDING',
  };
  const tx: any = {
    maintenanceVisit: {
      update: async (args: any) => {
        updates.push(args);
        return { ...visit, ...args.data };
      },
    },
    paperworkStatusHistory: { create: async (args: any) => { history.push(args); return args.data; } },
    adminAuditLog: { create: async (args: any) => { audits.push(args); return args.data; } },
  };
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: '22222222-2222-4222-8222-222222222222', role: UserRole.ADMIN }) },
    $transaction: async (work: (client: any) => Promise<any>) => work(tx),
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  const result: any = await service.updatePaperwork({
    visitId: visit.id,
    adminUserId: '22222222-2222-4222-8222-222222222222',
    kind: PaperworkKind.CONFIRMATION,
    status: 'APPROVED' as any,
    note: 'Fiziksel teyit kontrol edildi',
  });

  assert.equal(result.confirmationStatus, 'APPROVED');
  assert.equal(result.confirmationApprovalSource, 'MANUAL_ADMIN');
  assert.deepEqual(updates[0].data, {
    confirmationStatus: 'APPROVED',
    confirmationApprovalSource: 'MANUAL_ADMIN',
  });
  assert.equal(history[0].data.newStatus, 'APPROVED');
  assert.equal(audits[0].data.action, 'CONFIRMATION_MANUALLY_APPROVED');
  assert.equal(audits[0].data.actorId, '22222222-2222-4222-8222-222222222222');
});

test('an admin can explicitly clear a previous manual confirmation lock', async () => {
  const updates: any[] = [];
  const visit = {
    id: '11111111-1111-4111-8111-111111111111',
    status: VisitStatus.VALID,
    confirmationStatus: 'APPROVED',
    confirmationApprovalSource: 'MANUAL_ADMIN',
    serviceSlipStatus: 'PENDING',
  };
  const tx: any = {
    maintenanceVisit: { update: async (args: any) => { updates.push(args); return { ...visit, ...args.data }; } },
    paperworkStatusHistory: { create: async ({ data }: any) => data },
    adminAuditLog: { create: async ({ data }: any) => data },
  };
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: '22222222-2222-4222-8222-222222222222', role: UserRole.ADMIN }) },
    $transaction: async (work: (client: any) => Promise<any>) => work(tx),
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  await service.updatePaperwork({
    visitId: visit.id,
    adminUserId: '22222222-2222-4222-8222-222222222222',
    kind: PaperworkKind.CONFIRMATION,
    status: 'MISSING' as any,
  });

  assert.deepEqual(updates[0].data, {
    confirmationStatus: 'MISSING',
    confirmationApprovalSource: null,
  });
});

test('admin re-approval promotes AUTO_SAP approval to the MANUAL_ADMIN lock', async () => {
  const updates: any[] = [];
  const visit = {
    id: '11111111-1111-4111-8111-111111111111',
    status: VisitStatus.VALID,
    confirmationStatus: 'APPROVED',
    confirmationApprovalSource: 'AUTO_SAP',
    serviceSlipStatus: 'PENDING',
  };
  const tx: any = {
    maintenanceVisit: { update: async (args: any) => { updates.push(args); return { ...visit, ...args.data }; } },
    paperworkStatusHistory: { create: async ({ data }: any) => data },
    adminAuditLog: { create: async ({ data }: any) => data },
  };
  const prisma: any = {
    maintenanceVisit: { findUnique: async () => visit },
    user: { findFirst: async () => ({ id: '22222222-2222-4222-8222-222222222222', role: UserRole.ADMIN }) },
    $transaction: async (work: (client: any) => Promise<any>) => work(tx),
  };
  const service = new MaintenanceService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

  await service.updatePaperwork({
    visitId: visit.id,
    adminUserId: '22222222-2222-4222-8222-222222222222',
    kind: PaperworkKind.CONFIRMATION,
    status: 'APPROVED' as any,
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.confirmationApprovalSource, 'MANUAL_ADMIN');
});
