import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LocationSource,
  MaintenanceType,
  PointStatus,
  ProspectStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConvertProspectDto } from './dto/convert-prospect.dto';

@Injectable()
export class ProspectConversionService {
  constructor(private readonly prisma: PrismaService) {}

  async convert(prospectId: string, dto: ConvertProspectDto) {
    const [admin, prospect, region] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: dto.adminUserId, active: true } }),
      this.prisma.prospectCustomer.findUnique({ where: { id: prospectId } }),
      this.prisma.region.findUnique({ where: { id: dto.regionId } }),
    ]);

    if (!admin || admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Aday müşteriyi gerçek noktaya yalnızca yönetici dönüştürebilir');
    }
    if (!prospect) throw new NotFoundException('Aday müşteri bulunamadı');
    if (!region) throw new NotFoundException('Bölge bulunamadı');
    if (prospect.status !== ProspectStatus.CANDIDATE) {
      throw new BadRequestException('Yalnızca aktif aday müşteri gerçek noktaya dönüştürülebilir');
    }

    const code = (dto.pointCode?.trim() || prospect.sapNo?.trim() || '').trim();
    if (!code) {
      throw new BadRequestException('Gerçek noktaya dönüştürmek için SAP No / nokta kodu zorunludur');
    }
    if (code.length > 64) throw new BadRequestException('Nokta kodu çok uzun');

    if (dto.maintenanceType === MaintenanceType.STANDARD && ![1, 2].includes(dto.maintenanceWeek ?? 0)) {
      throw new BadRequestException('Standard noktada bakım haftası 1 veya 2 olmalıdır');
    }

    let smartcleanReferenceAt: Date | null = null;
    if (dto.maintenanceType === MaintenanceType.SMARTCLEAN) {
      if (!dto.smartcleanReferenceAt) {
        throw new BadRequestException('SmartClean noktasında referans tarihi zorunludur');
      }
      smartcleanReferenceAt = new Date(dto.smartcleanReferenceAt);
      if (Number.isNaN(smartcleanReferenceAt.getTime())) {
        throw new BadRequestException('SmartClean referans tarihi geçersiz');
      }
    }

    const existingPoint = await this.prisma.point.findUnique({ where: { code } });
    if (existingPoint) {
      throw new ConflictException({
        message: 'Bu SAP No / nokta kodu ile zaten gerçek bir nokta var',
        existingPoint: {
          id: existingPoint.id,
          code: existingPoint.code,
          name: existingPoint.name,
          status: existingPoint.status,
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const point = await tx.point.create({
        data: {
          code,
          name: prospect.name,
          address: prospect.address,
          regionId: dto.regionId,
          status: PointStatus.ACTIVE,
          maintenanceType: dto.maintenanceType,
          maintenanceWeek:
            dto.maintenanceType === MaintenanceType.STANDARD ? dto.maintenanceWeek ?? null : null,
          smartcleanReferenceAt,
          canonicalLatitude: prospect.latitude,
          canonicalLongitude: prospect.longitude,
          locationSource: prospect.googlePlaceId ? LocationSource.GOOGLE_MATCH : LocationSource.FIELD_CONFIRMED,
          locationConfidence: prospect.googlePlaceId ? 95 : 60,
          googlePlaceId: prospect.googlePlaceId,
          googleBusinessName: prospect.googlePlaceId ? prospect.name : null,
        },
      });

      const converted = await tx.prospectCustomer.update({
        where: { id: prospect.id },
        data: {
          status: ProspectStatus.CONVERTED,
          convertedAt: new Date(),
        },
      });

      await tx.adminAuditLog.create({
        data: {
          entityType: 'PROSPECT_CUSTOMER',
          entityId: prospect.id,
          action: 'CONVERT_TO_POINT',
          actorId: admin.id,
          oldValue: {
            status: prospect.status,
            name: prospect.name,
            sapNo: prospect.sapNo,
            googlePlaceId: prospect.googlePlaceId,
          },
          newValue: {
            status: ProspectStatus.CONVERTED,
            pointId: point.id,
            pointCode: point.code,
            regionId: point.regionId,
            maintenanceType: point.maintenanceType,
            maintenanceWeek: point.maintenanceWeek,
          },
          note: dto.note?.trim() || null,
        },
      });

      return {
        prospect: converted,
        point,
        linkedHistory: true,
        historyLink: {
          type: 'ADMIN_AUDIT',
          prospectId: prospect.id,
          pointId: point.id,
        },
      };
    });
  }
}
