import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProspectSource, ProspectStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmEfesimProspectDto } from './dto/confirm-efesim-prospect.dto';

type GooglePlaceResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
};

@Injectable()
export class ProspectConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async confirm(dto: ConfirmEfesimProspectDto) {
    await this.requireTechnician(dto.technicianId);

    const customerName = dto.customerName.replace(/\s+/g, ' ').trim();
    if (!customerName) throw new BadRequestException('Müşteri adı zorunludur');

    const sapNo = dto.sapNo?.trim() || null;
    if (sapNo && !/^\d{6,10}$/.test(sapNo)) {
      throw new BadRequestException('SAP No 6-10 haneli sayısal değer olmalıdır');
    }

    if (sapNo) {
      const existingPoint = await this.prisma.point.findFirst({
        where: { code: sapNo, deletedAt: null },
        select: { id: true, code: true, name: true, status: true },
      });
      if (existingPoint) {
        throw new ConflictException({
          message: 'Bu SAP No zaten kayıtlı bir noktaya ait',
          existingPoint,
        });
      }
    }

    const googlePlaceId = dto.googlePlaceId?.trim() || null;
    const existingProspect = await this.prisma.prospectCustomer.findFirst({
      where: {
        status: ProspectStatus.CANDIDATE,
        OR: [
          ...(sapNo ? [{ sapNo }] : []),
          ...(googlePlaceId ? [{ googlePlaceId }] : []),
        ],
      },
    });
    if (existingProspect) return existingProspect;

    let latitude = dto.latitude;
    let longitude = dto.longitude;
    let address: string | null = null;
    let googleName: string | null = null;

    if (googlePlaceId) {
      const place = await this.getGooglePlace(googlePlaceId);
      if (!place) {
        throw new BadRequestException('Seçilen Google Maps işletmesi doğrulanamadı');
      }
      latitude = place.latitude;
      longitude = place.longitude;
      address = place.address;
      googleName = place.name;
    }

    return this.prisma.prospectCustomer.create({
      data: {
        name: customerName,
        sapNo,
        source: ProspectSource.EFESIM,
        googlePlaceId,
        address,
        latitude: new Prisma.Decimal(latitude),
        longitude: new Prisma.Decimal(longitude),
        createdById: dto.technicianId,
      },
      select: {
        id: true,
        name: true,
        sapNo: true,
        source: true,
        status: true,
        googlePlaceId: true,
        address: true,
        latitude: true,
        longitude: true,
        createdAt: true,
      },
    }).then((prospect) => ({
      ...prospect,
      confirmationMode: googlePlaceId ? 'GOOGLE_MATCH' : 'MANUAL_NAME_ONLY',
      googleBusinessName: googleName,
      addressEditable: false,
      addressSource: googlePlaceId ? 'GOOGLE' : 'NONE',
    }));
  }

  private async getGooglePlace(placeId: string) {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY')?.trim();
    if (!apiKey) return null;

    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=tr&regionCode=TR`,
        {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,businessStatus',
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) return null;

      const place = (await response.json()) as GooglePlaceResponse;
      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;
      if (
        !place.id ||
        latitude === undefined ||
        longitude === undefined ||
        place.businessStatus === 'CLOSED_PERMANENTLY'
      ) {
        return null;
      }

      return {
        placeId: place.id,
        name: place.displayName?.text?.trim() || null,
        address: place.formattedAddress?.trim() || null,
        latitude,
        longitude,
      };
    } catch {
      return null;
    }
  }

  private async requireTechnician(id: string) {
    const technician = await this.prisma.user.findFirst({
      where: { id, active: true, role: UserRole.TECHNICIAN },
      select: { id: true },
    });
    if (!technician) throw new NotFoundException('Teknisyen bulunamadı veya pasif');
    return technician;
  }
}
