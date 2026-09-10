import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PointAssignmentKind, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePointAssignmentDto,
  DeactivatePointAssignmentDto,
} from './dto/create-point-assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePointAssignmentDto) {
    const [point, technician, admin] = await Promise.all([
      this.prisma.point.findFirst({
        where: { id: dto.pointId, deletedAt: null },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.technicianId, active: true, role: UserRole.TECHNICIAN },
        select: { id: true, name: true },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.adminUserId, active: true, role: UserRole.ADMIN },
        select: { id: true, name: true },
      }),
    ]);

    if (!point) throw new NotFoundException('Nokta bulunamadı');
    if (!technician) throw new NotFoundException('Teknisyen bulunamadı veya pasif');
    if (!admin) throw new ForbiddenException('Görevlendirmeyi yalnızca admin yapabilir');

    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    this.assertDate(startsAt, 'startsAt');
    if (endsAt) this.assertDate(endsAt, 'endsAt');
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('Bitiş tarihi başlangıç tarihinden sonra olmalıdır');
    }
    if (dto.kind === PointAssignmentKind.TEMPORARY && !endsAt) {
      throw new BadRequestException('Geçici görevlendirmede bitiş tarihi zorunludur');
    }

    if (dto.kind === PointAssignmentKind.TEMPORARY) {
      const overlap = await this.prisma.pointAssignment.findFirst({
        where: {
          pointId: dto.pointId,
          kind: PointAssignmentKind.TEMPORARY,
          active: true,
          startsAt: { lt: endsAt! },
          OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
        },
        select: { id: true },
      });
      if (overlap) {
        throw new BadRequestException('Bu nokta için çakışan aktif geçici görevlendirme var');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.kind === PointAssignmentKind.POINT_OVERRIDE) {
        const previous = await tx.pointAssignment.findMany({
          where: {
            pointId: dto.pointId,
            kind: PointAssignmentKind.POINT_OVERRIDE,
            active: true,
          },
          select: { id: true, technicianId: true, startsAt: true, endsAt: true, reason: true },
        });

        if (previous.length > 0) {
          await tx.pointAssignment.updateMany({
            where: { id: { in: previous.map((item) => item.id) } },
            data: { active: false, deactivatedAt: new Date() },
          });

          for (const old of previous) {
            await tx.adminAuditLog.create({
              data: {
                entityType: 'POINT_ASSIGNMENT',
                entityId: old.id,
                action: 'AUTO_DEACTIVATED_BY_REPLACEMENT',
                actorId: admin.id,
                oldValue: {
                  pointId: dto.pointId,
                  technicianId: old.technicianId,
                  startsAt: old.startsAt.toISOString(),
                  endsAt: old.endsAt?.toISOString() ?? null,
                  reason: old.reason,
                  active: true,
                },
                newValue: { active: false },
                note: 'Yeni kalıcı nokta istisnası oluşturuldu',
              },
            });
          }
        }
      }

      const assignment = await tx.pointAssignment.create({
        data: {
          pointId: dto.pointId,
          technicianId: dto.technicianId,
          kind: dto.kind,
          startsAt,
          endsAt,
          reason: dto.reason?.trim() || null,
          createdById: dto.adminUserId,
        },
        include: {
          technician: { select: { id: true, name: true, active: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      await tx.adminAuditLog.create({
        data: {
          entityType: 'POINT_ASSIGNMENT',
          entityId: assignment.id,
          action: 'CREATED',
          actorId: admin.id,
          newValue: {
            pointId: point.id,
            pointCode: point.code,
            pointName: point.name,
            technicianId: technician.id,
            technicianName: technician.name,
            kind: assignment.kind,
            startsAt: assignment.startsAt.toISOString(),
            endsAt: assignment.endsAt?.toISOString() ?? null,
            active: assignment.active,
          },
          note: dto.reason?.trim() || null,
        },
      });

      return assignment;
    });
  }

  async deactivate(id: string, dto: DeactivatePointAssignmentDto) {
    const [assignment, admin] = await Promise.all([
      this.prisma.pointAssignment.findUnique({
        where: { id },
        include: { technician: { select: { id: true, name: true } } },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.adminUserId, active: true, role: UserRole.ADMIN },
        select: { id: true, name: true },
      }),
    ]);
    if (!assignment) throw new NotFoundException('Görevlendirme bulunamadı');
    if (!admin) throw new ForbiddenException('Görevlendirmeyi yalnızca admin kapatabilir');
    if (!assignment.active) return assignment;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pointAssignment.update({
        where: { id },
        data: {
          active: false,
          deactivatedAt: new Date(),
          reason: dto.reason?.trim()
            ? [assignment.reason, `KAPATMA: ${dto.reason.trim()}`].filter(Boolean).join(' | ')
            : assignment.reason,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          entityType: 'POINT_ASSIGNMENT',
          entityId: assignment.id,
          action: 'DEACTIVATED',
          actorId: admin.id,
          oldValue: {
            active: true,
            technicianId: assignment.technicianId,
            technicianName: assignment.technician.name,
            kind: assignment.kind,
            startsAt: assignment.startsAt.toISOString(),
            endsAt: assignment.endsAt?.toISOString() ?? null,
          },
          newValue: {
            active: false,
            deactivatedAt: updated.deactivatedAt?.toISOString() ?? null,
          },
          note: dto.reason?.trim() || null,
        },
      });

      return updated;
    });
  }

  async pointHistory(pointId: string) {
    const point = await this.prisma.point.findFirst({
      where: { id: pointId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        region: { select: { id: true, name: true, technicianId: true } },
      },
    });
    if (!point) throw new NotFoundException('Nokta bulunamadı');

    const assignments = await this.prisma.pointAssignment.findMany({
      where: { pointId },
      include: {
        technician: { select: { id: true, name: true, active: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    });

    return { point, assignments };
  }

  async auditHistory(assignmentId: string) {
    const assignment = await this.prisma.pointAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, pointId: true, kind: true, active: true },
    });
    if (!assignment) throw new NotFoundException('Görevlendirme bulunamadı');

    const history = await this.prisma.adminAuditLog.findMany({
      where: { entityType: 'POINT_ASSIGNMENT', entityId: assignmentId },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return { assignment, history };
  }

  async effectiveForPoint(pointId: string, asOfInput?: Date) {
    const asOf = asOfInput ?? new Date();
    const point = await this.prisma.point.findFirst({
      where: { id: pointId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        region: {
          select: {
            id: true,
            name: true,
            technician: { select: { id: true, name: true, active: true, role: true } },
          },
        },
      },
    });
    if (!point) throw new NotFoundException('Nokta bulunamadı');

    const assignment = await this.prisma.pointAssignment.findFirst({
      where: {
        pointId,
        active: true,
        startsAt: { lte: asOf },
        OR: [{ endsAt: null }, { endsAt: { gt: asOf } }],
        technician: { active: true, role: UserRole.TECHNICIAN },
      },
      include: { technician: { select: { id: true, name: true, active: true } } },
      orderBy: [{ kind: 'desc' }, { startsAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (assignment?.kind === PointAssignmentKind.TEMPORARY) {
      return {
        pointId,
        source: 'TEMPORARY' as const,
        technicianId: assignment.technicianId,
        technician: assignment.technician,
        assignmentId: assignment.id,
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
      };
    }

    if (assignment?.kind === PointAssignmentKind.POINT_OVERRIDE) {
      return {
        pointId,
        source: 'POINT_OVERRIDE' as const,
        technicianId: assignment.technicianId,
        technician: assignment.technician,
        assignmentId: assignment.id,
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
      };
    }

    const regionTechnician = point.region?.technician ?? null;
    return {
      pointId,
      source: 'REGION' as const,
      technicianId:
        regionTechnician?.active && regionTechnician.role === UserRole.TECHNICIAN
          ? regionTechnician.id
          : null,
      technician:
        regionTechnician?.active && regionTechnician.role === UserRole.TECHNICIAN
          ? regionTechnician
          : null,
      assignmentId: null,
      startsAt: null,
      endsAt: null,
    };
  }

  async resolveMany(pointIds: string[], asOfInput?: Date) {
    const uniqueIds = [...new Set(pointIds)];
    const entries = await Promise.all(
      uniqueIds.map(async (pointId) => [pointId, await this.effectiveForPoint(pointId, asOfInput)] as const),
    );
    return new Map(entries);
  }

  private assertDate(value: Date, field: string) {
    if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} geçersiz`);
  }
}
