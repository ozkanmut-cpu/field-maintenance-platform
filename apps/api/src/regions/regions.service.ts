import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PointStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeRegionTechnicianDto } from './dto/change-region-technician.dto';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.region.findMany({
      orderBy: { name: 'asc' },
      include: {
        technician: { select: { id: true, name: true, email: true, active: true } },
        _count: { select: { points: true } },
      },
    });
  }

  create(dto: CreateRegionDto) {
    return this.prisma.region.create({
      data: {
        name: dto.name.trim(),
        technicianId: dto.technicianId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateRegionDto) {
    const [region, admin] = await Promise.all([
      this.prisma.region.findUnique({ where: { id }, select: { id: true, name: true } }),
      this.prisma.user.findFirst({
        where: { id: dto.adminUserId, active: true, role: UserRole.ADMIN },
        select: { id: true },
      }),
    ]);
    if (!region) throw new NotFoundException('Bölge bulunamadı');
    if (!admin) throw new ForbiddenException('Bölge bilgisini yalnızca admin değiştirebilir');

    const nextName = dto.name?.trim();
    if (!nextName || nextName === region.name) return region;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.region.update({ where: { id }, data: { name: nextName } });
      await tx.adminAuditLog.create({
        data: {
          entityType: 'REGION',
          entityId: id,
          action: 'NAME_CHANGED',
          actorId: admin.id,
          oldValue: { name: region.name },
          newValue: { name: nextName },
        },
      });
      return updated;
    });
  }

  async technicianChangePreview(regionId: string, technicianId: string) {
    const [region, technician] = await Promise.all([
      this.prisma.region.findUnique({
        where: { id: regionId },
        select: {
          id: true,
          name: true,
          technicianId: true,
          technician: { select: { id: true, name: true, active: true } },
        },
      }),
      this.prisma.user.findFirst({
        where: { id: technicianId, active: true, role: UserRole.TECHNICIAN },
        select: { id: true, name: true },
      }),
    ]);
    if (!region) throw new NotFoundException('Bölge bulunamadı');
    if (!technician) throw new NotFoundException('Yeni teknisyen bulunamadı veya pasif');

    const now = new Date();
    const points = await this.prisma.point.findMany({
      where: { regionId, deletedAt: null },
      select: {
        id: true,
        status: true,
        assignments: {
          where: {
            active: true,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: { id: true, kind: true, technicianId: true },
          take: 1,
        },
      },
    });

    const withPointAssignment = points.filter((point) => point.assignments.length > 0);
    const inherited = points.filter((point) => point.assignments.length === 0);
    const activeInherited = inherited.filter((point) => point.status === PointStatus.ACTIVE);

    return {
      region: { id: region.id, name: region.name },
      currentTechnician: region.technician,
      newTechnician: technician,
      totalPoints: points.length,
      affectedByRegionChange: inherited.length,
      affectedActivePoints: activeInherited.length,
      protectedByPointAssignment: withPointAssignment.length,
      statusBreakdown: {
        active: points.filter((point) => point.status === PointStatus.ACTIVE).length,
        passive: points.filter((point) => point.status === PointStatus.PASSIVE).length,
        cancelled: points.filter((point) => point.status === PointStatus.CANCELLED).length,
      },
      sameTechnician: region.technicianId === technicianId,
    };
  }

  async changeTechnician(regionId: string, dto: ChangeRegionTechnicianDto) {
    const [preview, admin] = await Promise.all([
      this.technicianChangePreview(regionId, dto.technicianId),
      this.prisma.user.findFirst({
        where: { id: dto.adminUserId, active: true, role: UserRole.ADMIN },
        select: { id: true, name: true },
      }),
    ]);
    if (!admin) throw new ForbiddenException('Bölge teknisyenini yalnızca admin değiştirebilir');

    const before = preview.currentTechnician
      ? { technicianId: preview.currentTechnician.id, technicianName: preview.currentTechnician.name }
      : { technicianId: null, technicianName: null };
    const after = {
      technicianId: preview.newTechnician.id,
      technicianName: preview.newTechnician.name,
    };

    if (preview.sameTechnician) return { changed: false, preview };

    return this.prisma.$transaction(async (tx) => {
      const region = await tx.region.update({
        where: { id: regionId },
        data: { technicianId: dto.technicianId },
        include: { technician: { select: { id: true, name: true, active: true } } },
      });

      const audit = await tx.adminAuditLog.create({
        data: {
          entityType: 'REGION',
          entityId: regionId,
          action: 'TECHNICIAN_CHANGED',
          actorId: admin.id,
          oldValue: before,
          newValue: {
            ...after,
            impact: {
              affectedByRegionChange: preview.affectedByRegionChange,
              affectedActivePoints: preview.affectedActivePoints,
              protectedByPointAssignment: preview.protectedByPointAssignment,
            },
          },
          note: dto.reason?.trim() || null,
        },
      });

      return { changed: true, region, preview, auditId: audit.id };
    });
  }

  async auditHistory(regionId: string) {
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true, name: true },
    });
    if (!region) throw new NotFoundException('Bölge bulunamadı');

    const history = await this.prisma.adminAuditLog.findMany({
      where: { entityType: 'REGION', entityId: regionId },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return { region, history };
  }
}
