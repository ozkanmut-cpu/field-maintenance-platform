import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NonMaintenanceVisitPurpose,
  PointStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AssignmentsService } from '../assignments/assignments.service';
import { businessDayRange } from '../common/business-time';
import { PrismaService } from '../prisma/prisma.service';
import { NonMaintenanceVisitDto } from './dto/non-maintenance-visit.dto';

@Injectable()
export class NonMaintenanceVisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  async create(dto: NonMaintenanceVisitDto) {
    const existing = await this.prisma.nonMaintenanceVisit.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;

    const [point, technician] = await Promise.all([
      this.prisma.point.findFirst({
        where: { id: dto.pointId, deletedAt: null },
        select: { id: true, status: true, code: true, name: true },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.technicianId, active: true, role: UserRole.TECHNICIAN },
        select: { id: true, name: true },
      }),
    ]);

    if (!point) throw new NotFoundException('Nokta bulunamadı');
    if (!technician) throw new NotFoundException('Teknisyen bulunamadı veya pasif');
    if (point.status === PointStatus.CANCELLED) {
      throw new BadRequestException('İPTAL noktaya bakım dışı ziyaret kaydedilemez');
    }

    const now = new Date();
    const visitedAt = dto.visitedAt ? new Date(dto.visitedAt) : now;
    const locationCapturedAt = new Date(dto.locationCapturedAt);
    this.assertDate(visitedAt, 'visitedAt');
    this.assertDate(locationCapturedAt, 'locationCapturedAt');
    if (visitedAt.getTime() > now.getTime() + 5 * 60_000) {
      throw new BadRequestException('Ziyaret tarihi gelecekte olamaz');
    }

    const assignment = await this.assignments.effectiveForPoint(point.id, visitedAt);
    if (!assignment.technicianId) {
      throw new BadRequestException('Bu nokta için atanmış aktif teknisyen bulunmuyor');
    }
    if (assignment.technicianId !== dto.technicianId) {
      throw new ForbiddenException('Bu ziyaret tarihinde nokta başka bir teknisyene atanmış');
    }

    try {
      return await this.prisma.nonMaintenanceVisit.create({
        data: {
          pointId: dto.pointId,
          technicianId: dto.technicianId,
          purpose: dto.purpose,
          note: dto.note?.trim() || null,
          latitude: new Prisma.Decimal(dto.latitude),
          longitude: new Prisma.Decimal(dto.longitude),
          accuracyMeters:
            dto.accuracyMeters !== undefined ? new Prisma.Decimal(dto.accuracyMeters) : null,
          locationCapturedAt,
          visitedAt,
          idempotencyKey: dto.idempotencyKey,
        },
        include: {
          point: { select: { id: true, code: true, name: true } },
          technician: { select: { id: true, name: true } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu bakım dışı ziyaret zaten işlendi');
      }
      throw error;
    }
  }

  async technicianHistory(technicianId: string, dateInput?: string) {
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, active: true, role: UserRole.TECHNICIAN },
      select: { id: true, name: true },
    });
    if (!technician) throw new NotFoundException('Teknisyen bulunamadı veya pasif');

    const date = dateInput ? new Date(dateInput) : new Date();
    this.assertDate(date, 'date');
    const { key, start, end } = businessDayRange(date);

    const items = await this.prisma.nonMaintenanceVisit.findMany({
      where: {
        technicianId,
        visitedAt: { gte: start, lt: end },
      },
      include: {
        point: { select: { id: true, code: true, name: true, status: true } },
      },
      orderBy: { visitedAt: 'asc' },
    });

    return {
      date: key,
      technician,
      count: items.length,
      items,
    };
  }

  private assertDate(value: Date, field: string) {
    if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} geçersiz`);
  }

}
