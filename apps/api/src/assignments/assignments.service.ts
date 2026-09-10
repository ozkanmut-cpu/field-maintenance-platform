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
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.technicianId, active: true, role: UserRole.TECHNICIAN },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.adminUserId, active: true, role: UserRole.ADMIN },
        select: { id: true },
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
        await tx.pointAssignment.updateMany({
          where: {
            pointId: dto.pointId,
            kind: PointAssignmentKind.POINT_OVERRIDE,
            active: true,
          },
          data: { active: false, deactivatedAt: new Date() },
        });
      }

      return tx.pointAssignment.create({
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
    });
  }

  async deactivate(id: string, dto: DeactivatePointAssignmentDto) {
    const [assignment, admin] = await Promise.all([
      this.prisma.pointAssignment.findUnique({ where: { id } }),
      this.prisma.user.findFirst({
        where: { id: dto.adminUserId, active: true, role: UserRole.ADMIN },
        select: { id: true },
      }),
    ]);
    if (!assignment) throw new NotFoundException('Görevlendirme bulunamadı');
    if (!admin) throw new ForbiddenException('Görevlendirmeyi yalnızca admin kapatabilir');
    if (!assignment.active) return assignment;

    return this.prisma.pointAssignment.update({
      where: { id },
      data: {
        active: false,
        deactivatedAt: new Date(),
        reason: dto.reason?.trim()
          ? [assignment.reason, `KAPATMA: ${dto.reason.trim()}`].filter(Boolean).join(' | ')
          : assignment.reason,
      },
    });
  }

  async pointHistory(pointId: string) {
    const point = await this.prisma.point.findFirst({
      where: { id: pointId, deletedAt: null },
      select: { id: true, code: true, name: true, region: { select: { id: true, name: true, technicianId: true } } },
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

    const regionTechnician = point.region.technician;
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
