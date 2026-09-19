import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { UserRole, VisitStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

function makeService() {
  const queries: Record<string, any> = {};
  const point = { id: 'point-1', code: 'P-1', name: 'Nokta', maintenanceType: 'STANDARD' };
  const assistedForTechnician = { id: 'tech-2', name: 'Zeynep', username: 'zeynep' };
  const prisma: any = {
    user: {
      findFirst: async () => ({ id: 'tech-1', name: 'Ali' }),
    },
    maintenanceVisit: {
      findMany: async (args: any) => {
        queries.maintenance = args;
        return [{
          id: 'visit-1',
          performedAt: new Date('2026-09-14T21:00:00.000Z'),
          enteredLate: false,
          assistedForTechnicianId: null,
          assistedForTechnician: null,
          serviceSlipStatus: 'PRESENT',
          confirmationStatus: 'PRESENT',
          point,
        }];
      },
    },
    maintenanceAttempt: {
      findMany: async (args: any) => {
        queries.attempt = args;
        return [{
          id: 'attempt-1',
          attemptedAt: new Date('2026-09-16T08:00:00.000Z'),
          assistedForTechnicianId: 'tech-2',
          assistedForTechnician,
          reason: 'ACCESS_FAILED',
          note: null,
          point,
        }];
      },
    },
    nonMaintenanceVisit: {
      findMany: async (args: any) => {
        queries.nonMaintenance = args;
        return [{ id: 'other-1', visitedAt: new Date('2026-09-18T12:00:00.000Z'), purpose: 'OTHER', note: null, point }];
      },
    },
    prospectVisit: {
      findMany: async (args: any) => {
        queries.prospect = args;
        return [{
          id: 'prospect-1',
          visitedAt: new Date('2026-09-20T20:59:59.999Z'),
          purpose: 'SURVEY',
          note: null,
          prospect: { id: 'prospect-1', name: 'Aday', sapNo: null, status: 'CANDIDATE', convertedPointId: null },
        }];
      },
    },
  };

  return {
    service: new MaintenanceService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any),
    queries,
  };
}

test('technician history returns every real operation in an inclusive Istanbul date range', async () => {
  const { service, queries } = makeService();

  const result = await (service as any).technicianHistory('tech-1', {
    from: '2026-09-14',
    to: '2026-09-20',
  });

  assert.equal(result.from, '2026-09-14');
  assert.equal(result.to, '2026-09-20');
  assert.equal(result.totalOperations, 4);
  assert.deepEqual(result.items.map((item: any) => item.type), [
    'MAINTENANCE',
    'ATTEMPT',
    'NON_MAINTENANCE_VISIT',
    'PROSPECT_VISIT',
  ]);
  assert.deepEqual(result.items[1].assistedForTechnician, assistedTechnician());

  for (const query of Object.values(queries)) {
    const timeField = query.where.performedAt ?? query.where.attemptedAt ?? query.where.visitedAt;
    assert.equal(query.where.technicianId, 'tech-1');
    assert.equal(timeField.gte.toISOString(), '2026-09-13T21:00:00.000Z');
    assert.equal(timeField.lt.toISOString(), '2026-09-20T21:00:00.000Z');
  }
  assert.equal(queries.maintenance.where.status, VisitStatus.VALID);
  assert.deepEqual(queries.attempt.select.assistedForTechnician, {
    select: { id: true, name: true, username: true },
  });
});

test('technician history preserves the legacy single-date timestamp contract', async () => {
  const { service, queries } = makeService();

  const result = await (service as any).technicianHistory('tech-1', {
    date: '2026-09-16T20:59:59.999Z',
  });

  assert.equal(result.date, '2026-09-16');
  assert.equal(result.from, '2026-09-16');
  assert.equal(result.to, '2026-09-16');
  assert.equal(queries.maintenance.where.performedAt.gte.toISOString(), '2026-09-15T21:00:00.000Z');
  assert.equal(queries.maintenance.where.performedAt.lt.toISOString(), '2026-09-16T21:00:00.000Z');
});

test('technician history rejects unsupported boundary years as controlled bad requests', async () => {
  for (const query of [
    { from: '0001-01-01', to: '0001-01-01' },
    { from: '9999-12-31', to: '9999-12-31' },
    { date: '0001-01-01T12:00:00.000Z' },
    { date: '9999-12-31T12:00:00.000Z' },
  ]) {
    const { service, queries } = makeService();
    await assert.rejects(
      () => (service as any).technicianHistory('tech-1', query),
      (error: unknown) => error instanceof BadRequestException && /1000 ile 9998/.test(error.message),
    );
    assert.deepEqual(queries, {});
  }
});

test('technician history requires a complete ordered range of real date-only values', async () => {
  const { service } = makeService();

  const invalidCases: Array<[Record<string, string>, RegExp]> = [
    [{ from: '2026-09-14' }, /from ve to birlikte/i],
    [{ to: '2026-09-20' }, /from ve to birlikte/i],
    [{ from: '2026-9-14', to: '2026-09-20' }, /from YYYY-MM-DD/i],
    [{ from: '2026-02-30', to: '2026-03-01' }, /from geçersiz tarih/i],
    [{ from: '2026-09-20', to: '2026-09-14' }, /from tarihi to tarihinden sonra/i],
    [{ date: '2026-09-18', from: '2026-09-14', to: '2026-09-20' }, /date ile from\/to birlikte/i],
  ];
  for (const [query, expected] of invalidCases) {
    await assert.rejects(
      () => (service as any).technicianHistory('tech-1', query),
      (error: unknown) => error instanceof BadRequestException && expected.test(error.message),
    );
  }
});

test('technician history allows at most 31 inclusive business dates', async () => {
  const atLimit = makeService();
  const result = await (atLimit.service as any).technicianHistory('tech-1', {
    from: '2026-09-01',
    to: '2026-10-01',
  });
  assert.equal(result.from, '2026-09-01');
  assert.equal(result.to, '2026-10-01');

  const overLimit = makeService();
  await assert.rejects(
    () => (overLimit.service as any).technicianHistory('tech-1', {
      from: '2026-09-01',
      to: '2026-10-02',
    }),
    (error: unknown) => error instanceof BadRequestException && /en fazla 31 gün/i.test(error.message),
  );
  assert.deepEqual(overLimit.queries, {});
});

test('technician history controller ignores another technician id for technicians but permits admin targeting', async () => {
  const calls: any[] = [];
  const maintenance: any = {
    technicianHistory: async (...args: any[]) => {
      calls.push(args);
      return { from: '2026-09-14', to: '2026-09-20', totalOperations: 0, items: [] };
    },
  };
  const duplicateSource: any = {
    technicianHistory: async () => assert.fail('controller must not append duplicate non-maintenance history'),
  };
  const controller = new MaintenanceController(
    maintenance,
    {} as any,
    {} as any,
    {} as any,
    duplicateSource,
    {} as any,
  );
  const technician: AuthenticatedUser = {
    id: 'tech-1', name: 'Ali', username: 'ali', role: UserRole.TECHNICIAN, tokenVersion: 0,
  };
  const admin: AuthenticatedUser = {
    id: 'admin-1', name: 'Admin', username: 'admin', role: UserRole.ADMIN, tokenVersion: 0,
  };

  await (controller as any).technicianHistory(technician, 'tech-2', undefined, '2026-09-14', '2026-09-20');
  await (controller as any).technicianHistory(admin, 'tech-2', undefined, '2026-09-14', '2026-09-20');

  assert.deepEqual(calls, [
    ['tech-1', { date: undefined, from: '2026-09-14', to: '2026-09-20' }],
    ['tech-2', { date: undefined, from: '2026-09-14', to: '2026-09-20' }],
  ]);
});

function assistedTechnician() {
  return { id: 'tech-2', name: 'Zeynep', username: 'zeynep' };
}
