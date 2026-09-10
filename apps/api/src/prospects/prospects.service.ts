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

type GoogleNearbyPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
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

    const googlePlaceId = dto.googlePlaceId?.trim() || null;
    const duplicate = await this.prisma.prospectCustomer.findFirst({
      where: {
        status: ProspectStatus.CANDIDATE,
        OR: [
          ...(googlePlaceId ? [{ googlePlaceId }] : []),
          ...(sapNo ? [{ sapNo }] : []),
        ],
      },
    });
    if (duplicate) return duplicate;

    let address: string | null = null;
    let latitude = dto.latitude;
    let longitude = dto.longitude;

    if (googlePlaceId) {
      const place = await this.getGooglePlace(googlePlaceId);
      if (!place) {
        throw new BadRequestException('Google Maps işletme bilgisi doğrulanamadı');
      }
      address = place.address;
      latitude = place.latitude;
      longitude = place.longitude;
    }

    return this.prisma.prospectCustomer.create({
      data: {
        name,
        sapNo,
        source: dto.source,
        googlePlaceId,
        address,
        latitude: new Prisma.Decimal(latitude),
        longitude: new Prisma.Decimal(longitude),
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
            select: { id: true, name: true, sapNo: true, status: true, googlePlaceId: true },
          })
        : null,
    ]);

    const duplicate = existingPoint
      ? { type: 'POINT' as const, item: existingPoint }
      : existingProspect
        ? { type: 'PROSPECT' as const, item: existingProspect }
        : null;

    const googleMatch =
      !duplicate && customerName && dto.latitude !== undefined && dto.longitude !== undefined
        ? await this.findGoogleMatch(customerName, dto.latitude, dto.longitude)
        : null;

    const nextStep = duplicate
      ? 'USE_EXISTING'
      : googleMatch?.matched
        ? 'CONFIRM_GOOGLE_MATCH'
        : 'MANUAL_ENTRY';

    return {
      customerName,
      sapNo,
      confidence: extracted.confidence ?? null,
      layoutMatched: extracted.layoutMatched ?? null,
      duplicate,
      googleMatch,
      nextStep,
      flow: ['EFESIM', 'GOOGLE_MATCH', 'MANUAL_ENTRY'],
      addressPolicy: 'GOOGLE_ONLY',
      suggestedCreatePayload: googleMatch?.matched
        ? {
            technicianId: dto.technicianId,
            name: customerName,
            sapNo,
            source: ProspectSource.EFESIM,
            googlePlaceId: googleMatch.placeId,
            latitude: googleMatch.latitude,
            longitude: googleMatch.longitude,
          }
        : {
            technicianId: dto.technicianId,
            name: customerName,
            sapNo,
            source: ProspectSource.EFESIM,
            latitude: dto.latitude ?? null,
            longitude: dto.longitude ?? null,
          },
    };
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
            'X-Goog-FieldMask': 'id,formattedAddress,location,businessStatus',
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) return null;
      const place = (await response.json()) as GoogleNearbyPlace;
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
        address: place.formattedAddress?.trim() || null,
        latitude,
        longitude,
      };
    } catch {
      return null;
    }
  }

  private async findGoogleMatch(customerName: string, latitude: number, longitude: number) {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY')?.trim();
    if (!apiKey) {
      return {
        attempted: false,
        matched: false,
        reason: 'GOOGLE_MAPS_NOT_CONFIGURED',
      } as const;
    }

    const radius = Number(this.config.get<string>('GOOGLE_PLACES_RADIUS_METERS') ?? '250');
    const minNameScore = Number(this.config.get<string>('GOOGLE_PLACES_MIN_NAME_SCORE') ?? '0.72');
    const minTotalScore = Number(this.config.get<string>('GOOGLE_PLACES_MIN_TOTAL_SCORE') ?? '0.82');
    const minMargin = Number(this.config.get<string>('GOOGLE_PLACES_MIN_MARGIN') ?? '0.08');

    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus',
        },
        body: JSON.stringify({
          languageCode: 'tr',
          regionCode: 'TR',
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: { latitude, longitude },
              radius,
            },
          },
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          attempted: true,
          matched: false,
          reason: `GOOGLE_PLACES_HTTP_${response.status}`,
        } as const;
      }

      const payload = (await response.json()) as { places?: GoogleNearbyPlace[] };
      const candidates = (payload.places ?? [])
        .filter((place) => place.businessStatus !== 'CLOSED_PERMANENTLY')
        .map((place) => {
          const name = place.displayName?.text?.trim() ?? '';
          const placeLat = place.location?.latitude;
          const placeLng = place.location?.longitude;
          if (!name || placeLat === undefined || placeLng === undefined || !place.id) return null;
          const nameScore = this.diceSimilarity(customerName, name);
          const distanceMeters = this.haversineMeters(latitude, longitude, placeLat, placeLng);
          const proximityScore = Math.max(0, 1 - distanceMeters / Math.max(radius, 1));
          const score = 0.8 * nameScore + 0.2 * proximityScore;
          return {
            placeId: place.id,
            name,
            address: place.formattedAddress ?? null,
            latitude: placeLat,
            longitude: placeLng,
            distanceMeters: Math.round(distanceMeters),
            nameScore: Number(nameScore.toFixed(3)),
            score: Number(score.toFixed(3)),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => b.score - a.score);

      const best = candidates[0];
      const second = candidates[1];
      if (!best) {
        return { attempted: true, matched: false, reason: 'NO_NEARBY_BUSINESS' } as const;
      }

      const margin = second ? best.score - second.score : best.score;
      const matched =
        best.nameScore >= minNameScore && best.score >= minTotalScore && margin >= minMargin;

      if (!matched) {
        return {
          attempted: true,
          matched: false,
          reason: 'WEAK_OR_AMBIGUOUS_MATCH',
          bestCandidate: best,
          alternativeCandidates: candidates.slice(1, 4),
        } as const;
      }

      return {
        attempted: true,
        matched: true,
        ...best,
        confidence: Math.min(100, Math.round(best.score * 100)),
        alternatives: candidates.slice(1, 4),
      } as const;
    } catch (error) {
      return {
        attempted: true,
        matched: false,
        reason: error instanceof Error ? `GOOGLE_MATCH_ERROR:${error.message}` : 'GOOGLE_MATCH_ERROR',
      } as const;
    }
  }

  private diceSimilarity(a: string, b: string) {
    const left = this.normalizeName(a);
    const right = this.normalizeName(b);
    if (left === right) return 1;
    if (left.length < 2 || right.length < 2) return 0;
    const grams = (value: string) => {
      const result: string[] = [];
      for (let i = 0; i < value.length - 1; i += 1) result.push(value.slice(i, i + 2));
      return result;
    };
    const leftGrams = grams(left);
    const rightGrams = grams(right);
    const counts = new Map<string, number>();
    for (const gram of leftGrams) counts.set(gram, (counts.get(gram) ?? 0) + 1);
    let matches = 0;
    for (const gram of rightGrams) {
      const count = counts.get(gram) ?? 0;
      if (count > 0) {
        matches += 1;
        counts.set(gram, count - 1);
      }
    }
    return (2 * matches) / (leftGrams.length + rightGrams.length);
  }

  private normalizeName(value: string) {
    return value
      .toLocaleUpperCase('tr-TR')
      .replace(/[^A-ZÇĞİÖŞÜ0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadius = 6_371_000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
