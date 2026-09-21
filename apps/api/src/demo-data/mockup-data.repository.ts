import type { PrismaClient } from '@prisma/client';
import { MOCKUP_DATASET, assertNamedMockupRegion, buildNamedMockupPointWhere } from './demo-data-plan';

export type MockupPurgeStore = Pick<PrismaClient,
  | 'region'
  | 'point'
  | 'user'
  | 'maintenanceVisit'
  | 'prospectCustomer'
  | 'paperworkStatusHistory'
  | 'maintenanceReviewResolution'
  | 'sapConfirmationReconciliation'
  | 'adminAuditLog'
  | 'maintenanceAttempt'
  | 'nonMaintenanceVisit'
  | 'pointAssignment'
  | 'pointAlias'
  | 'maintenanceObligation'
  | 'prospectVisit'
  | 'technicianHelpPermission'
  | '$transaction'
>;

export async function purgeNamedMockupData(prisma: MockupPurgeStore, datasetNote: string) {
  const region = await prisma.region.findUnique({
    where: { name: MOCKUP_DATASET.regionName },
    select: { id: true },
  });
  const regionPoints = region
    ? await prisma.point.findMany({
      where: { regionId: region.id },
      select: { id: true, code: true, regionId: true },
    })
    : [];

  if (region) assertNamedMockupRegion(regionPoints, region.id);

  const points = region
    ? await prisma.point.findMany({
      where: buildNamedMockupPointWhere(region.id),
      select: { id: true },
    })
    : [];
  const pointIds = points.map((point) => point.id);
  const users = await prisma.user.findMany({
    where: {
      username: {
        in: [MOCKUP_DATASET.technicianUsername, MOCKUP_DATASET.helperUsername],
      },
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const visits = pointIds.length
    ? await prisma.maintenanceVisit.findMany({
      where: { pointId: { in: pointIds } },
      select: { id: true },
    })
    : [];
  const visitIds = visits.map((visit) => visit.id);
  const prospects = userIds.length
    ? await prisma.prospectCustomer.findMany({
      where: { createdById: { in: userIds } },
      select: { id: true },
    })
    : [];
  const prospectIds = prospects.map((prospect) => prospect.id);

  await prisma.$transaction(async (tx) => {
    if (visitIds.length) {
      await tx.paperworkStatusHistory.deleteMany({ where: { visitId: { in: visitIds } } });
      await tx.maintenanceReviewResolution.deleteMany({ where: { visitId: { in: visitIds } } });
      await tx.sapConfirmationReconciliation.deleteMany({ where: { visitId: { in: visitIds } } });
    }

    await tx.adminAuditLog.deleteMany({ where: { note: datasetNote } });

    if (pointIds.length) {
      await tx.maintenanceVisit.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.maintenanceAttempt.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.nonMaintenanceVisit.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.pointAssignment.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.pointAlias.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.maintenanceObligation.deleteMany({ where: { pointId: { in: pointIds } } });
      await tx.point.deleteMany({ where: { id: { in: pointIds } } });
    }
    if (prospectIds.length) {
      await tx.prospectVisit.deleteMany({ where: { prospectId: { in: prospectIds } } });
      await tx.prospectCustomer.deleteMany({ where: { id: { in: prospectIds } } });
    }

    if (userIds.length) {
      await tx.technicianHelpPermission.deleteMany({
        where: {
          OR: [{ helperId: { in: userIds } }, { targetId: { in: userIds } }],
        },
      });
    }

    if (region) await tx.region.delete({ where: { id: region.id } });
    if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });

  return { points: pointIds.length, users: userIds.length, region: Boolean(region) };
}
