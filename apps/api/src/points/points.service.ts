import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenanceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePointDto } from './dto/create-point.dto';
import { UpdatePointDto } from './dto/update-point.dto';

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.point.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        region: {
          include: {
            technician: { select: { id: true, name: true, email: true, active: true } },
          },
        },
      },
    });
  }

  async get(id: string) {
    const point = await this.prisma.point.findFirst({
      where: { id, deletedAt: null },
      include: { region: true },
    });
    if (!point) throw new NotFoundException('Nokta bulunamadı');
    return point;
  }

  async create(dto: CreatePointDto) {
    this.validateSchedule(dto.maintenanceType, dto.maintenanceWeek, dto.smartcleanReferenceAt);

    return this.prisma.point.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        regionId: dto.regionId,
        status: dto.status,
        maintenanceType: dto.maintenanceType,
        maintenanceWeek: dto.maintenanceType === MaintenanceType.STANDARD ? dto.maintenanceWeek : null,
        smartcleanReferenceAt:
          dto.maintenanceType === MaintenanceType.SMARTCLEAN && dto.smartcleanReferenceAt
            ? new Date(dto.smartcleanReferenceAt)
            : null,
      },
    });
  }

  async update(id: string, dto: UpdatePointDto) {
    const existing = await this.get(id);
    const maintenanceType = dto.maintenanceType ?? existing.maintenanceType;
    const maintenanceWeek = dto.maintenanceWeek ?? existing.maintenanceWeek ?? undefined;
    const smartcleanReferenceAt = dto.smartcleanReferenceAt ?? existing.smartcleanReferenceAt?.toISOString();

    this.validateSchedule(maintenanceType, maintenanceWeek, smartcleanReferenceAt);

    const data: Prisma.PointUpdateInput = {
      ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
      ...(dto.regionId !== undefined ? { region: { connect: { id: dto.regionId } } } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      maintenanceType,
      maintenanceWeek: maintenanceType === MaintenanceType.STANDARD ? maintenanceWeek : null,
      smartcleanReferenceAt:
        maintenanceType === MaintenanceType.SMARTCLEAN && smartcleanReferenceAt
          ? new Date(smartcleanReferenceAt)
          : null,
    };

    return this.prisma.point.update({ where: { id }, data });
  }

  private validateSchedule(type: MaintenanceType, week?: number, smartcleanReferenceAt?: string) {
    if (type === MaintenanceType.STANDARD && ![1, 2].includes(week ?? 0)) {
      throw new BadRequestException('Standard nokta için maintenanceWeek 1 veya 2 olmalıdır');
    }

    if (type === MaintenanceType.SMARTCLEAN && !smartcleanReferenceAt) {
      throw new BadRequestException('SmartClean nokta için referans tarihi zorunludur');
    }
  }
}
