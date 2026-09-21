import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { NonMaintenanceVisitDto } from './dto/non-maintenance-visit.dto';
import { NonMaintenanceVisitService } from './non-maintenance-visit.service';

const POINT_ID = '11111111-1111-4111-8111-111111111111';
const TECHNICIAN_ID = '22222222-2222-4222-8222-222222222222';
const VISIT_TYPES = [
  'BREAKDOWN',
  'FAULTY_KEG',
  'FACILITY_INSTALLATION',
  'FACILITY_REMOVAL',
  'MOBILE_INSTALLATION',
  'MOBILE_REMOVAL',
  'SMART_TAP_INSTALLATION',
  'SMART_TAP_BREAKDOWN',
  'SMART_TAP_REMOVAL',
  'SURVEY',
] as const;

async function validate(payload: Record<string, unknown>) {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }).transform(payload, { type: 'body', metatype: NonMaintenanceVisitDto, data: '' });
}
function payload(overrides: Record<string, unknown> = {}) {
  return {
    pointId: POINT_ID,
    purpose: 'BREAKDOWN',
    note: 'Saha kontrolü',
    visitedAt: '2026-09-20T09:30:00.000Z',
    idempotencyKey: 'non-maintenance-contract',
    ...overrides,
  };
}

function harness(existing: any = null) {
  const visits: any[] = existing ? [existing] : [];
  const audits: any[] = [];
  const forbidden: string[] = [];
  const nonMaintenanceVisit = {
    findUnique: async ({ where }: any) =>
      visits.find((item) => item.idempotencyKey === where.idempotencyKey) ?? null,
    create: async ({ data }: any) => {
      const visit = {
        id: 'other-visit-1',
        ...data,
        point: data.pointId ? { id: data.pointId, code: 'P1', name: 'Ada Büfe' } : null,
        technician: { id: TECHNICIAN_ID, name: 'Can Durmaz' },
      };
      visits.push(visit);
      return visit;
    },
    findMany: async () => visits,
  };
  const tx = {
    nonMaintenanceVisit,
    adminAuditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
        return data;
      },
    },
    maintenanceVisit: { create: async () => forbidden.push('maintenanceVisit.create') },
    maintenanceObligation: { update: async () => forbidden.push('maintenanceObligation.update') },
  };
  const prisma: any = {
    nonMaintenanceVisit,
    point: {
      findFirst: async ({ where }: any) => where.id === POINT_ID
        ? { id: POINT_ID, status: 'ACTIVE', code: 'P1', name: 'Ada Büfe' }
        : null,
    },
    user: {
      findFirst: async () => ({ id: TECHNICIAN_ID, name: 'Can Durmaz' }),
    },
    $transaction: async (fn: any) => fn(tx),
  };
  const assignments: any = {
    effectiveForPoint: async () => ({ technicianId: TECHNICIAN_ID }),
  };
  return {
    service: new NonMaintenanceVisitService(prisma, assignments),
    visits,
    audits,
    forbidden,
  };
}

test('DTO accepts all ten exact non-maintenance visit types', async () => {
  for (const purpose of VISIT_TYPES) {
    const result: any = await validate(payload({
      purpose,
      idempotencyKey: `visit-${purpose.toLowerCase()}`,
    }));
    assert.equal(result.purpose, purpose);
  }
});

test('point and no-point visits persist independent history and audit without maintenance semantics', async () => {
  const selected = harness();
  await selected.service.create({
    ...(await validate(payload()) as NonMaintenanceVisitDto),
    technicianId: TECHNICIAN_ID,
  });
  assert.equal(selected.visits[0].pointId, POINT_ID);
  assert.equal(selected.audits[0].entityType, 'NON_MAINTENANCE_VISIT');
  assert.equal(selected.audits[0].action, 'NON_MAINTENANCE_VISIT_RECORDED');
  assert.deepEqual(selected.forbidden, []);

  const noPoint = harness();
  await noPoint.service.create({
    ...(await validate(payload({
      pointId: undefined,
      customerName: 'Kayıtsız Müşteri',
      efesimImageBase64: 'data:image/jpeg;base64,ZmFrZQ==',
      idempotencyKey: 'pointless-visual',
    })) as NonMaintenanceVisitDto),
    technicianId: TECHNICIAN_ID,
  });
  assert.equal(noPoint.visits[0].pointId, null);
  assert.equal(noPoint.visits[0].customerName, 'Kayıtsız Müşteri');
  assert.equal(noPoint.visits[0].efesimImageBase64, 'data:image/jpeg;base64,ZmFrZQ==');
  assert.equal(noPoint.audits.length, 1);
  assert.deepEqual(noPoint.forbidden, []);

  const history = await noPoint.service.technicianHistory(TECHNICIAN_ID, '2026-09-20');
  assert.equal((history.items[0] as any).historyLabel, 'Kayıtsız Müşteri · Arıza');
});

test('customerless visit saves with explanation when EFESİM visual is unavailable', async () => {
  const h = harness();
  await h.service.create({
    ...(await validate(payload({
      pointId: undefined,
      customerName: 'Kayıtsız Müşteri',
      visualExplanation: 'EFESİM erişimi yoktu',
      idempotencyKey: 'pointless-fallback',
    })) as NonMaintenanceVisitDto),
    technicianId: TECHNICIAN_ID,
  });
  assert.equal(h.visits[0].efesimImageBase64, null);
  assert.equal(h.visits[0].visualExplanation, 'EFESİM erişimi yoktu');
  assert.equal(h.audits[0].newValue.evidenceMode, 'EXPLANATION');
});

test('customerless visit rejects only when both visual and explanation are absent', async () => {
  const h = harness();
  await assert.rejects(
    h.service.create({
      ...(await validate(payload({
        pointId: undefined,
        customerName: 'Kayıtsız Müşteri',
        idempotencyKey: 'pointless-no-evidence',
      })) as NonMaintenanceVisitDto),
      technicianId: TECHNICIAN_ID,
    }),
    /EFESİM görseli veya açıklama/,
  );
  assert.equal(h.visits.length, 0);
  assert.equal(h.audits.length, 0);
});

test('idempotency returns the original independent visit without a second audit', async () => {
  const original = {
    id: 'existing-visit',
    idempotencyKey: 'same-key',
    purpose: 'SURVEY',
  };
  const h = harness(original);
  const result = await h.service.create({
    ...(await validate(payload({
      purpose: 'SURVEY',
      idempotencyKey: 'same-key',
    })) as NonMaintenanceVisitDto),
    technicianId: TECHNICIAN_ID,
  });
  assert.equal(result, original);
  assert.equal(h.visits.length, 1);
  assert.equal(h.audits.length, 0);
  assert.deepEqual(h.forbidden, []);
});

test('legacy stored visit purposes remain readable without reopening them in the DTO', async () => {
  const legacy = {
    id: 'legacy-visit',
    idempotencyKey: 'legacy-key',
    pointId: null,
    customerName: 'Eski Kayıt',
    purpose: 'INSTALLATION',
    visitedAt: new Date('2026-09-20T09:30:00.000Z'),
  };
  const h = harness(legacy);
  const history = await h.service.technicianHistory(TECHNICIAN_ID, '2026-09-20');
  assert.equal((history.items[0] as any).historyLabel, 'Eski Kayıt · Tesis Kurulum');
  await assert.rejects(
    validate(payload({ purpose: 'INSTALLATION', idempotencyKey: 'legacy-new' })),
    /Bad Request/,
  );
});
