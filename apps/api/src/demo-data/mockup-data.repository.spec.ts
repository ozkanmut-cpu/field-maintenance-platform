import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { purgeNamedMockupData } from './mockup-data.repository';

type Row = Record<string, any>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((rule: Row) => matches(row, rule));
    if (key === 'AND') return value.every((rule: Row) => matches(row, rule));
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('startsWith' in value) return row[key]?.startsWith(value.startsWith);
      throw new Error(`Unsupported query operator: ${key}`);
    }
    return row[key] === value;
  });
}
function fixture(audits: Row[], nonMaintenanceVisits: Row[] = [], withRegion = true) {
  let rows: Record<string, Row[]> = {
    region: withRegion ? [{ id: 'region', name: 'Kordon Operasyon Bölgesi' }] : [],
    point: withRegion ? [{ id: 'point', regionId: 'region', code: 'KOR-1001' }] : [],
    user: [{ id: 'tech', username: 'mockup.ozge.kaya' }, { id: 'helper', username: 'mockup.can.durmaz' }, { id: 'live-user', username: 'operational' }],
    maintenanceVisit: withRegion ? [{ id: 'visit', pointId: 'point', technicianId: 'tech' }] : [],
    nonMaintenanceVisit: nonMaintenanceVisits, adminAuditLog: audits,
  };
  const deletes: string[] = [];
  const store: any = {};
  for (const name of ['region', 'point', 'user', 'maintenanceVisit', 'nonMaintenanceVisit', 'adminAuditLog', 'prospectCustomer', 'paperworkStatusHistory', 'maintenanceReviewResolution', 'sapConfirmationReconciliation', 'maintenanceAttempt', 'pointAssignment', 'pointAlias', 'maintenanceObligation', 'prospectVisit', 'technicianHelpPermission']) {
    rows[name] ??= [];
    store[name] = {
      findUnique: async ({ where }: any) => rows[name].find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: any) => rows[name].filter((row) => matches(row, where)),
      deleteMany: async ({ where }: any) => {
        const selected = rows[name].filter((row) => matches(row, where));
        if (name === 'user') for (const user of selected) {
          if (rows.adminAuditLog.some((row) => row.actorId === user.id)) throw new Error('AuditActor FK restrict');
          if (rows.nonMaintenanceVisit.some((row) => row.technicianId === user.id)) throw new Error('NonMaintenanceVisit technician FK restrict');
        }
        if (name === 'point' && selected.some((point) => rows.nonMaintenanceVisit.some((row) => row.pointId === point.id))) {
          throw new Error('NonMaintenanceVisit point FK restrict');
        }
        deletes.push(name);
        rows[name] = rows[name].filter((row) => !matches(row, where));
        return { count: selected.length };
      },
      delete: async ({ where }: any) => { rows[name] = rows[name].filter((row) => !matches(row, where)); },
    };
  }
  store.$transaction = async (run: any) => {
    const before = structuredClone(rows);
    try { return await run(store); } catch (error) { rows = before; throw error; }
  };
  return { store, rows: () => rows, deletes };
}
const audit = (id: string, action: string, note: string | null, extra: Row = {}) => ({ id, action, note, actorId: 'tech', entityType: 'MAINTENANCE_VISIT', entityId: 'visit', ...extra });

test('real purge handles fixed, free-text and null runtime audit notes with actor/entity/action ownership', async () => {
  const f = fixture([
    audit('normal', 'MAINTENANCE_COOLER_COUNT_RECORDED', 'Bakımı yapılan soğutucu adedi tamamlandı olarak kaydedildi'),
    audit('partial', 'MAINTENANCE_PARTIAL_COOLER_COUNT_RECORDED', 'Eksik bakım teknisyen tarafından tamamlanmış olarak kaydedildi'),
    audit('late', 'MAINTENANCE_ENTERED_LATE', 'Geriye dönük bakım girişi; konum değerlendirmesi uygulanmadı'),
    audit('equipment', 'MAINTENANCE_VERIFIED_CHANGED', 'Bakım sırasında ekipman bilgisi doğrulandı ve güncellendi', { entityType: 'POINT_EQUIPMENT', entityId: 'point' }),
    audit('non-null', 'NON_MAINTENANCE_VISIT_RECORDED', null, { entityType: 'NON_MAINTENANCE_VISIT', entityId: 'non' }),
    audit('non-free', 'NON_MAINTENANCE_VISIT_RECORDED', 'Fıçı bağlantısı kontrol edildi', { entityType: 'NON_MAINTENANCE_VISIT', entityId: 'non', actorId: 'helper' }),
    audit('legacy', 'PARTIAL_MAINTENANCE', 'fixture note', { entityType: 'MaintenanceVisit' }),
    audit('seed', 'SEED_CREATED', 'fixture note', { entityType: 'SHOWCASE_DATASET', entityId: 'region' }),
    audit('live-audit', 'MAINTENANCE_COOLER_COUNT_RECORDED', 'fixture note', { actorId: 'live-user', entityId: 'live-visit' }),
    audit('live-actor', 'MAINTENANCE_COOLER_COUNT_RECORDED', null, { actorId: 'live-user' }),
  ], [{ id: 'non', pointId: 'point', technicianId: 'tech', purpose: 'BREAKDOWN' }]);
  await purgeNamedMockupData(f.store, 'fixture note');
  assert.deepEqual(f.rows().adminAuditLog.map((row) => row.id), ['live-audit', 'live-actor']);
  assert.deepEqual(f.rows().user.map((row) => row.id), ['live-user']);
  assert.ok(f.deletes.indexOf('adminAuditLog') < f.deletes.indexOf('user'));
  await purgeNamedMockupData(f.store, 'fixture note');
  assert.deepEqual(f.rows().adminAuditLog.map((row) => row.id), ['live-audit', 'live-actor']);
});

test('unproven audit ownership fails closed instead of deleting operational records', async () => {
  for (const extra of [
    { entityId: 'live-visit' }, { action: 'UNRECOGNIZED_ACTION' }, { entityType: 'OPERATIONAL_ENTITY' },
    { entityType: 'SHOWCASE_DATASET', entityId: 'region', action: 'SEED_CREATED', note: 'not the fixture' },
    { entityType: 'MaintenanceVisit', action: 'PARTIAL_MAINTENANCE', note: 'not the fixture' },
  ]) {
    const f = fixture([audit('preserve', 'MAINTENANCE_COOLER_COUNT_RECORDED', null, extra)]);
    await assert.rejects(() => purgeNamedMockupData(f.store, 'fixture note'), /AuditActor FK restrict/);
    assert.equal(f.rows().adminAuditLog[0].id, 'preserve');
    assert.equal(f.rows().user.length, 3);
  }
});

const visitPurposes = ['BREAKDOWN', 'FAULTY_KEG', 'FACILITY_INSTALLATION', 'FACILITY_REMOVAL', 'MOBILE_INSTALLATION', 'MOBILE_REMOVAL', 'SMART_TAP_INSTALLATION', 'SMART_TAP_BREAKDOWN', 'SMART_TAP_REMOVAL', 'SURVEY', 'INSTALLATION', 'REMOVAL'];
test('customerless mockup visits and audits purge before users for every purpose, even without a region', async () => {
  for (const withRegion of [true, false]) {
    const visits = visitPurposes.map((purpose, index) => ({ id: purpose, purpose, pointId: null, technicianId: index % 2 ? 'helper' : 'tech' }));
    const audits = visits.map((visit) => audit(visit.id, 'NON_MAINTENANCE_VISIT_RECORDED', null, { entityType: 'NON_MAINTENANCE_VISIT', entityId: visit.id, actorId: visit.technicianId }));
    const f = fixture(audits, [...visits, { id: 'operational', purpose: 'BREAKDOWN', pointId: null, technicianId: 'live-user' }], withRegion);
    await purgeNamedMockupData(f.store, 'fixture note');
    assert.deepEqual(f.rows().nonMaintenanceVisit.map((row) => row.id), ['operational']);
    assert.deepEqual(f.rows().adminAuditLog, []);
    assert.deepEqual(f.rows().user.map((row) => row.id), ['live-user']);
    assert.ok(f.deletes.indexOf('adminAuditLog') < f.deletes.indexOf('nonMaintenanceVisit'));
    assert.ok(f.deletes.indexOf('nonMaintenanceVisit') < f.deletes.indexOf('user'));
    await purgeNamedMockupData(f.store, 'fixture note');
    assert.deepEqual(f.rows().nonMaintenanceVisit.map((row) => row.id), ['operational']);
  }
});
test('mockup account alone cannot authorize deletion of a visit attached to an operational point or unknown purpose', async () => {
  for (const extra of [{ pointId: 'operational-point' }, { purpose: 'UNKNOWN' }]) {
    const f = fixture([], [{ id: 'preserve', purpose: 'BREAKDOWN', pointId: null, technicianId: 'tech', ...extra }]);
    await assert.rejects(() => purgeNamedMockupData(f.store, 'fixture note'), /NonMaintenanceVisit technician FK restrict/);
    assert.equal(f.rows().nonMaintenanceVisit[0].id, 'preserve');
    assert.equal(f.rows().user.length, 3);
  }
});

test('customerless visit is removed even when it has no audit row', async () => {
  const f = fixture([], [{ id: 'customerless', pointId: null, technicianId: 'tech', purpose: 'SURVEY' }]);
  await purgeNamedMockupData(f.store, 'fixture note');
  assert.deepEqual(f.rows().nonMaintenanceVisit, []);
  assert.deepEqual(f.rows().user.map((row) => row.id), ['live-user']);
});

test('operational technician visit on a mockup point is preserved and makes cleanup fail closed', async () => {
  const f = fixture([], [{ id: 'operational', pointId: 'point', technicianId: 'live-user', purpose: 'BREAKDOWN' }]);
  await assert.rejects(() => purgeNamedMockupData(f.store, 'fixture note'), /NonMaintenanceVisit point FK restrict/);
  assert.equal(f.rows().nonMaintenanceVisit[0].id, 'operational');
  assert.equal(f.rows().point[0].id, 'point');
});
