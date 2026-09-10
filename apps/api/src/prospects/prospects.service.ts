import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ProspectSource,
  ProspectStatus,
  ProspectVisitPurpose,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { CreateProspectVisitDto } from './dto/create-prospect-visit.dto';
import { EfesimExtractDto } from './dto/efesim-extract.dto';

type EfesimVisionResult = {
  customerName?: string;
  sapNo?: string;
  confidence?: number;
};

@Injectable()
export class ProspectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list() {
    return this.prisma.prospectCustomer.findMany({
      where: { status: ProspectStatus.CANDIDATE },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { visits: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateProspectDto) {
    await this.requireTechnician(dto.technicianId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Aday müşteri adı zorunludur');
    if (dto.source === ProspectSource.GOOGLE_MAPS && !dto.googlePlaceId) {
      throw new BadRequestException('Google Maps adayında googlePlaceId zorunludur');
    }

    const duplicate = await this.prisma.prospectCustomer.findFirst({
      where: {
        status: ProspectStatus.CANDIDATE,
        OR: [
          ...(dto.googlePlaceId ? [{ googlePlaceId: dto.googlePlaceId }] : []),
          ...(dto.sapNo ? [{ sapNo: dto.sapNo.trim() }] : []),
        ],
      },
    });
    if (duplicate) return duplicate;

    return this.prisma.prospectCustomer.create({
      data: {
        name,
        sapNo: dto.sapNo?.trim() || null,
        source: dto.source,
        googlePlaceId: dto.googlePlaceId?.trim() || null,
        address: dto.address?.trim() || null,
        latitude: new Prisma.Decimal(dto.latitude),
        longitude: new Prisma.Decimal(dto.longitude),
        createdById: dto.technicianId,
      },
    });
  }

  async createVisit(dto: CreateProspectVisitDto) {
    const existing = await this.prisma.prospectVisit.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;

    await this.requireTechnician(dto.technicianId);
    const prospect = await this.prisma.prospectCustomer.findFirst({
      where: { id: dto.prospectId, status: ProspectStatus.CANDIDATE },
    });
    if (!prospect) throw new NotFoundException('Aday müşteri bulunamadı veya kapatılmış');

    if (![ProspectVisitPurpose.SURVEY, ProspectVisitPurpose.INSTALLATION].includes(dto.purpose)) {
      throw new BadRequestException('Aday müşteriye yalnızca Keşif veya Kurma ziyareti eklenebilir');
    }

    const locationCapturedAt = new Date(dto.locationCapturedAt);
    const visitedAt = dto.visitedAt ? new Date(dto.visitedAt) : new Date();
    if (Number.isNaN(locationCapturedAt.getTime())) {
      throw new BadRequestException('locationCapturedAt geçersiz');
    }
    if (Number.isNaN(visitedAt.getTime())) throw new BadRequestException('visitedAt geçersiz');

    try {
      return await this.prisma.prospectVisit.create({
        data: {
          prospectId: dto.prospectId,
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
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu aday müşteri ziyareti zaten işlendi');
      }
      throw error;
    }
  }

  async extractEfesim(dto: EfesimExtractDto) {
    await this.requireTechnician(dto.technicianId);
    const endpoint = this.config.get<string>('EFESIM_VISION_URL')?.trim();
    const token = this.config.get<string>('EFESIM_VISION_TOKEN')?.trim();
    if (!endpoint) {
      throw new ServiceUnavailableException('EFESIM ekran görüntüsü okuma servisi henüz yapılandırılmadı');
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        imageBase64: dto.imageBase64,
        task: 'EFESIM ekran görüntüsünden yalnız müşteri adı ve SAP numarasını çıkar',
        output: { customerName: 'string', sapNo: 'string', confidence: '0..1' },
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`EFESIM görüntü okuma servisi hata verdi: ${response.status}`);
    }

    const extracted = (await response.json()) as EfesimVisionResult;
    const customerName = extracted.customerName?.trim();
    const sapNo = extracted.sapNo?.trim();
    if (!customerName && !sapNo) {
      throw new BadRequestException('Ekran görüntüsünden müşteri adı veya SAP numarası okunamadı');
    }

    let prospect = null;
    if (customerName && dto.latitude !== undefined && dto.longitude !== undefined) {
      prospect = await this.create({
        technicianId: dto.technicianId,
        name: customerName,
        sapNo,
        source: ProspectSource.EFESIM,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
    }

    return {
      customerName: customerName ?? null,
      sapNo: sapNo ?? null,
      confidence: extracted.confidence ?? null,
      prospectCreated: Boolean(prospect),
      prospect,
    };
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
