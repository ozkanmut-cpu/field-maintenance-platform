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
  layoutMatched?: boolean;
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

    const duplicate = await this.prisma.prospectCustomer.findFirst({
      where: {
        status: ProspectStatus.CANDIDATE,
        OR: [
          ...(dto.googlePlaceId ? [{ googlePlaceId: dto.googlePlaceId }] : []),
          ...(sapNo ? [{ sapNo }] : []),
        ],
      },
    });
    if (duplicate) return duplicate;

    return this.prisma.prospectCustomer.create({
      data: {
        name,
        sapNo,
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
        task: 'EFESIM_DETAIL_HEADER_V1',
        instructions: [
          'Görüntünün üst kısmında mavi EFESİM başlığını bul.',
          'Başlığın hemen altındaki ilk beyaz müşteri kartını kullan.',
          'Kartın ilk satırındaki 6-10 haneli yalnız rakamlardan oluşan değeri sapNo olarak çıkar.',
          'Aynı kartın ikinci satırındaki işletme adını customerName olarak çıkar.',
          'ADRES VE İLETİŞİM BİLGİLERİ ve altındaki menü metinlerini müşteri adı olarak kullanma.',
          'Alanlardan emin değilsen uydurma; ilgili alanı null döndür.',
        ],
        output: {
          customerName: 'string|null',
          sapNo: '6-10 digit string|null',
          confidence: '0..1',
          layoutMatched: 'boolean',
        },
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(`EFESIM görüntü okuma servisi hata verdi: ${response.status}`);
    }

    const extracted = (await response.json()) as EfesimVisionResult;
    const customerName = this.cleanCustomerName(extracted.customerName);
    const sapNo = this.cleanSapNo(extracted.sapNo);

    if (!customerName && !sapNo) {
      throw new BadRequestException('EFESIM müşteri kartından müşteri adı veya SAP No okunamadı');
    }

    const [existingPoint, existingProspect] = await Promise.all([
      sapNo
        ? this.prisma.point.findFirst({
            where: { code: sapNo, deletedAt: null },
            select: { id: true, code: true, name: true, status: true },
          })
        : null,
      sapNo
        ? this.prisma.prospectCustomer.findFirst({
            where: { sapNo, status: ProspectStatus.CANDIDATE },
            select: { id: true, name: true, sapNo: true, status: true },
          })
        : null,
    ]);

    return {
      customerName,
      sapNo,
      confidence: extracted.confidence ?? null,
      layoutMatched: extracted.layoutMatched ?? null,
      requiresConfirmation: true,
      duplicate: existingPoint
        ? { type: 'POINT' as const, item: existingPoint }
        : existingProspect
          ? { type: 'PROSPECT' as const, item: existingProspect }
          : null,
      suggestedCreatePayload: {
        technicianId: dto.technicianId,
        name: customerName,
        sapNo,
        source: ProspectSource.EFESIM,
        address: dto.address ?? null,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
      },
    };
  }

  private cleanSapNo(value?: string) {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return /^\d{6,10}$/.test(digits) ? digits : null;
  }

  private cleanCustomerName(value?: string) {
    if (!value) return null;
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.length < 2 || normalized.length > 160) return null;
    const forbidden = [
      'ADRES VE İLETİŞİM BİLGİLERİ',
      'SOĞUTUCU EKİPMAN',
      'FIÇI ŞİŞE KULE ENVANTER',
      'PLANSIZ AKTİVİTE',
      'TABELA TENTE ENVANTER',
      'TABELA TENTE İŞLEMLERİ',
    ];
    if (forbidden.some((item) => normalized.toLocaleUpperCase('tr-TR').startsWith(item))) return null;
    return normalized;
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
