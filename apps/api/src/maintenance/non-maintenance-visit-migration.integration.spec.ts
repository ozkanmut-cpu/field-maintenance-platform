import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { PrismaService } from '../prisma/prisma.service';
import { requirePostgisTestDatabaseUrl } from '../points/point-spatial.integration-config';

const databaseUrl = requirePostgisTestDatabaseUrl(
  process.env.POSTGIS_TEST_DATABASE_URL,
);
const prisma = new PrismaService({ datasourceUrl: databaseUrl });
const technicianId = randomUUID();
const visitIds = [randomUUID(), randomUUID(), randomUUID()];
const suffix = randomUUID().slice(0, 8);

before(async () => {
  await prisma.$connect();
  await prisma.user.create({
    data: {
      id: technicianId,
      name: `Migration Contract ${suffix}`,
      username: `migration-contract-${suffix}`,
      passwordHash: 'integration-only',
      role: 'TECHNICIAN',
      active: true,
    },
  });
});

after(async () => {
  await prisma.nonMaintenanceVisit.deleteMany({
    where: { id: { in: visitIds } },
  });
  await prisma.user.delete({ where: { id: technicianId } });
  await prisma.$disconnect();
});
async function insertVisit(id: string, evidence: {
  customerName: string;
  efesimImageBase64?: string;
  visualExplanation?: string;
}) {
  await prisma.$executeRaw`
    INSERT INTO "non_maintenance_visits" (
      "id", "technician_id", "purpose", "customer_name",
      "efesim_image_base64", "visual_explanation", "idempotency_key"
    ) VALUES (
      ${id}::uuid, ${technicianId}::uuid, 'BREAKDOWN'::"NonMaintenanceVisitPurpose",
      ${evidence.customerName}, ${evidence.efesimImageBase64 ?? null},
      ${evidence.visualExplanation ?? null}, ${`migration-contract-${id}`}
    )
  `;
}

test('migration CHECK accepts point-less EFESIM and explanation evidence', async () => {
  await insertVisit(visitIds[0], {
    customerName: 'EFESIM Müşteri',
    efesimImageBase64: 'data:image/jpeg;base64,ZmFrZQ==',
  });
  await insertVisit(visitIds[1], {
    customerName: 'Açıklamalı Müşteri',
    visualExplanation: 'EFESİM ekranına erişilemedi; müşteri kartı sahada doğrulandı.',
  });

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    point_id: string | null;
    customer_name: string;
    efesim_image_base64: string | null;
    visual_explanation: string | null;
  }>>`
    SELECT "id", "point_id", "customer_name", "efesim_image_base64", "visual_explanation"
    FROM "non_maintenance_visits"
    WHERE "id" IN (${visitIds[0]}::uuid, ${visitIds[1]}::uuid)
    ORDER BY "id"
  `;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.point_id === null));
  const efesimRow = rows.find((row) => row.id === visitIds[0]);
  const explanationRow = rows.find((row) => row.id === visitIds[1]);
  assert.ok(efesimRow?.efesim_image_base64);
  assert.equal(explanationRow?.visual_explanation, 'EFESİM ekranına erişilemedi; müşteri kartı sahada doğrulandı.');
});
test('migration CHECK rejects point-less row without customer evidence', async () => {
  await assert.rejects(
    insertVisit(visitIds[2], { customerName: 'Kanıtsız Müşteri' }),
    /non_maintenance_visits_customer_evidence_check|check constraint/i,
  );

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "non_maintenance_visits"
    WHERE "id" = ${visitIds[2]}::uuid
  `;
  assert.equal(Number(rows[0].count), 0);
});
