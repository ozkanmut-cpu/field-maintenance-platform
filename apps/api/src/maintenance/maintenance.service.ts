import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenanceType, PointStatus, Prisma, VisitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteMaintenanceDto } from './dto/complete-maintenance.dto';
import { MaintenanceEngineService } from './maintenance-engine.service';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: MaintenanceEngineService,
  ) {}

  due(asOf?: string) {
    return this.engine.due(asOf);
  }

  async complete(dto: CompleteMaintenanceDto) {
    const existingByKey = await this.prisma.maintenanceVisit.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existingByKey) return existingByKey;

    const point = await this.prisma.point.findFirst({
      where: { id: dto.pointId, deletedAt: null },
      include: { region: true },
    });
    if (!point) throw new NotFoundException('Nokta bulunamadı');
    if (point.status !== PointStatus.ACTIVE) {
      throw new BadRequestException('Sadece AKTİF noktalarda bakım tamamlanabilir');
    }

    const technician = await this.prisma.user.findFirst({
      where: { id: dto.technicianId, active: true },
      select: { id: true },
    });
    if (!technician) throw new NotFoundException('Teknisyen bulunamadı veya pasif');

    const now = new Date();
    const performedAt = dto.performedAt ? new Date(dto.performedAt) : now;
    const locationCapturedAt = new Date(dto.locationCapturedAt);
    const deviceRecordedAt = dto.deviceRecordedAt ? new Date(dto.deviceRecordedAt) : null;

    this.assertValidDate(performedAt, 'performedAt');
    this.assertValidDate(locationCapturedAt, 'locationCapturedAt');
    if (deviceRecordedAt) this.assertValidDate(deviceRecordedAt, 'deviceRecordedAt');
    if (performedAt.getTime() > now.getTime() + 5 * 60_000) {
      throw new BadRequestException('Bakım tarihi gelecekte olamaz');
    }

    const enteredLate = this.dateKey(performedAt) < this.dateKey(now);
    if (enteredLate && !dto.lateEntryReason) {
      throw new BadRequestException('Geriye dönük bakım girişinde neden zorunludur');
    }

    await this.engine.ensureStandardObligations(performedAt);

    const obligation =
      point.maintenanceType === MaintenanceType.STANDARD
        ? await this.prisma.maintenanceObligation.findFirst({
            where: {
              pointId: point.id,
              completedAt: null,
              dueStart: { lte: this.dateOnly(performedAt) },
            },
            orderBy: { dueStart: 'asc' },
          })
        : null;

    if (point.maintenanceType === MaintenanceType.STANDARD && !obligation) {
      throw new BadRequestException('Bu tarih için açık Standard bakım yükümlülüğü bulunamadı');
    }

    const lateEntryMinutes = enteredLate
      ? Math.max(1, Math.floor((now.getTime() - performedAt.getTime()) / 60_000))
      : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const visit = await tx.maintenanceVisit.create({
          data: {
            pointId: point.id,
            technicianId: dto.technicianId,
            obligationId: obligation?.id ?? null,
            performedAt,
            deviceRecordedAt,
            enteredLate,
            lateEntryMinutes,
            lateEntryReason: enteredLate ? dto.lateEntryReason ?? null : null,
            latitude: new Prisma.Decimal(dto.latitude),
            longitude: new Prisma.Decimal(dto.longitude),
            accuracyMeters:
              dto.accuracyMeters !== undefined ? new Prisma.Decimal(dto.accuracyMeters) : null,
            locationCapturedAt,
            locationLearningEligible: !enteredLate,
            suspiciousBatch: false,
            reviewRecommended: enteredLate,
            reviewReason: enteredLate ? 'GERİYE DÖNÜK GİRİŞ' : null,
            status: VisitStatus.VALID,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        if (obligation) {
          await tx.maintenanceObligation.update({
            where: { id: obligation.id },
            data: { completedAt: performedAt },
          });
        }

        return visit;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu bakım kaydı zaten işlendi');
      }
      throw error;
    }
  }

  private assertValidDate(value: Date, field: string) {
    if (Number.isNaN(value.getTime())) throw new BadRequestException(`${field} geçersiz`);
  }

  private dateOnly(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private dateKey(date: Date) {
    return this.dateOnly(date).toISOString().slice(0, 10);
  }
}
