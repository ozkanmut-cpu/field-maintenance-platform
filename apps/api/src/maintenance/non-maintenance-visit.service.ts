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

const PURPOSE_LABELS: Record<NonMaintenanceVisitPurpose, string> = {
  BREAKDOWN: 'Arıza',
  FAULTY_KEG: 'Arızalı Fıçı',
  FACILITY_INSTALLATION: 'Tesis Kurulum',
  FACILITY_REMOVAL: 'Tesis Sökme',
  MOBILE_INSTALLATION: 'Seyyar Kurulum',
  MOBILE_REMOVAL: 'Seyyar Sökme',
  SMART_TAP_INSTALLATION: 'Smart Tap Kurulum',
  SMART_TAP_BREAKDOWN: 'Smart Tap Arıza',
  SMART_TAP_REMOVAL: 'Smart Tap Sökme',
  SURVEY: 'Keşif',
  INSTALLATION: 'Tesis Kurulum',
  REMOVAL: 'Tesis Sökme',
};
type CreateNonMaintenanceVisitInput = NonMaintenanceVisitDto & {
  technicianId: string;
};

@Injectable()
export class NonMaintenanceVisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  async create(dto: CreateNonMaintenanceVisitInput) {
    const existing = await this.prisma.nonMaintenanceVisit.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;

    const customerName = dto.customerName?.trim() || null;
    const efesimImageBase64 = dto.efesimImageBase64?.trim() || null;
    const visualExplanation = dto.visualExplanation?.trim() || null;
    if (!dto.pointId) {
      if (!customerName || customerName.length < 2) {
        throw new BadRequestException('Müşteri kaydı yok ziyaretinde müşteri adı zorunludur');
      }
      if (!efesimImageBase64 && !visualExplanation) {
        throw new BadRequestException('EFESİM görseli veya açıklama zorunludur');
      }
    }
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('latitude ve longitude birlikte gönderilmelidir');
    }
    const [point, technician] = await Promise.all([
      dto.pointId
        ? this.prisma.point.findFirst({
            where: { id: dto.pointId, deletedAt: null },
            select: { id: true, status: true, code: true, name: true },
          })
        : Promise.resolve(null),
      this.prisma.user.findFirst({
        where: { id: dto.technicianId, active: true, role: UserRole.TECHNICIAN },
        select: { id: true, name: true },
      }),
    ]);

    if (dto.pointId && !point) throw new NotFoundException('Nokta bulunamadı');
    if (!technician) throw new NotFoundException('Teknisyen bulunamadı veya pasif');
    if (point?.status === PointStatus.CANCELLED) {
      throw new BadRequestException('İPTAL noktaya bakım dışı ziyaret kaydedilemez');
    }

    const now = new Date();
    const visitedAt = dto.visitedAt ? new Date(dto.visitedAt) : now;
    const locationCapturedAt = dto.locationCapturedAt
      ? new Date(dto.locationCapturedAt)
      : null;
    this.assertDate(visitedAt, 'visitedAt');
    if (locationCapturedAt) this.assertDate(locationCapturedAt, 'locationCapturedAt');
    if (visitedAt.getTime() > now.getTime() + 5 * 60_000) {
      throw new BadRequestException('Ziyaret tarihi gelecekte olamaz');
    }
    if (point) {
      const assignment = await this.assignments.effectiveForPoint(point.id, visitedAt);
      if (!assignment.technicianId) {
        throw new BadRequestException('Bu nokta için atanmış aktif teknisyen bulunmuyor');
      }
      if (assignment.technicianId !== dto.technicianId) {
        throw new ForbiddenException('Bu ziyaret tarihinde nokta başka bir teknisyene atanmış');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const visit = await tx.nonMaintenanceVisit.create({
          data: {
            pointId: point?.id ?? null,
            technicianId: dto.technicianId,
            purpose: dto.purpose,
            customerName,
            note: dto.note?.trim() || null,
            efesimImageBase64,
            visualExplanation,
            latitude: dto.latitude === undefined ? null : new Prisma.Decimal(dto.latitude),
            longitude: dto.longitude === undefined ? null : new Prisma.Decimal(dto.longitude),
            accuracyMeters: dto.accuracyMeters === undefined
              ? null
              : new Prisma.Decimal(dto.accuracyMeters),
            locationCapturedAt,
            visitedAt,
            idempotencyKey: dto.idempotencyKey,
          },
          include: {
            point: { select: { id: true, code: true, name: true } },
            technician: { select: { id: true, name: true } },
          },
        });
        await tx.adminAuditLog.create({
          data: {
            entityType: 'NON_MAINTENANCE_VISIT',
            entityId: visit.id,
            action: 'NON_MAINTENANCE_VISIT_RECORDED',
            actorId: dto.technicianId,
            newValue: {
              pointId: point?.id ?? null,
              customerName,
              purpose: dto.purpose,
              purposeLabel: PURPOSE_LABELS[dto.purpose],
              evidenceMode: efesimImageBase64 ? 'EFESIM_VISUAL' : visualExplanation
                ? 'EXPLANATION'
                : 'NOT_REQUIRED',
            },
            note: dto.note?.trim() || null,
          },
        });
        return visit;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.nonMaintenanceVisit.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (duplicate) return duplicate;
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

    const rows = await this.prisma.nonMaintenanceVisit.findMany({
      where: {
        technicianId,
        visitedAt: { gte: start, lt: end },
      },
      include: {
        point: { select: { id: true, code: true, name: true, status: true } },
      },
      orderBy: { visitedAt: 'asc' },
    });
    const items = rows.map((item) => ({
      ...item,
      purposeLabel: PURPOSE_LABELS[item.purpose],
      historyLabel: `${item.point?.name ?? item.customerName ?? 'Müşteri kaydı yok'} · ${PURPOSE_LABELS[item.purpose]}`,
    }));

    return {
      date: key,
      technician,
      count: items.length,
      items,
    };
  }

  private assertDate(value: Date, field: string) {
    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException(`${field} geçersiz`);
    }
  }
}
