import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MaintenanceType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddPointAliasDto } from './dto/add-point-alias.dto';
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
        aliases: { orderBy: { createdAt: 'asc' } },
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
      include: {
        aliases: { orderBy: { createdAt: 'asc' } },
        region: true,
      },
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
            ? this.validDate(dto.smartcleanReferenceAt, 'smartcleanReferenceAt')
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
          ? this.validDate(smartcleanReferenceAt, 'smartcleanReferenceAt')
          : null,
    };

    return this.prisma.point.update({ where: { id }, data });
  }

  async addAlias(pointId: string, dto: AddPointAliasDto) {
    await this.requireAdmin(dto.adminUserId);
    const point = await this.get(pointId);
    const alias = dto.alias.trim();
    const normalized = this.normalize(alias);
    if (!normalized) throw new BadRequestException('Alias boş olamaz');
    if (normalized === this.normalize(point.name)) {
      throw new BadRequestException('Alias mevcut nokta adıyla aynı olamaz');
    }

    const existing = await this.prisma.pointAlias.findUnique({
      where: { pointId_normalized: { pointId, normalized } },
    });
    if (existing) return existing;

    return this.prisma.pointAlias.create({
      data: {
        pointId,
        alias,
        normalized,
        createdById: dto.adminUserId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  async aliases(pointId: string) {
    await this.get(pointId);
    return this.prisma.pointAlias.findMany({
      where: { pointId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async duplicateSuggestions(adminUserId: string, limit = 100) {
    await this.requireAdmin(adminUserId);
    const points = await this.prisma.point.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        regionId: true,
        status: true,
        googlePlaceId: true,
        googleBusinessName: true,
        canonicalLatitude: true,
        canonicalLongitude: true,
        aliases: { select: { alias: true } },
      },
      orderBy: { name: 'asc' },
    });

    const suggestions: Array<Record<string, unknown>> = [];
    for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
        const left = points[leftIndex];
        const right = points[rightIndex];
        const namesLeft = [left.name, left.googleBusinessName, ...left.aliases.map((item) => item.alias)].filter(
          (value): value is string => Boolean(value),
        );
        const namesRight = [right.name, right.googleBusinessName, ...right.aliases.map((item) => item.alias)].filter(
          (value): value is string => Boolean(value),
        );
        const nameSimilarity = Math.max(
          ...namesLeft.flatMap((a) => namesRight.map((b) => this.similarity(a, b))),
        );
        const sameGooglePlace = Boolean(
          left.googlePlaceId && right.googlePlaceId && left.googlePlaceId === right.googlePlaceId,
        );
        const distanceMeters = this.pointDistance(left, right);
        const addressSimilarity =
          left.address && right.address ? this.similarity(left.address, right.address) : null;

        const likelyByName = nameSimilarity >= 0.92;
        const likelyByLocation = distanceMeters !== null && distanceMeters <= 120 && nameSimilarity >= 0.55;
        const likelyByAddress = addressSimilarity !== null && addressSimilarity >= 0.88 && nameSimilarity >= 0.65;
        if (!sameGooglePlace && !likelyByName && !likelyByLocation && !likelyByAddress) continue;

        let score = nameSimilarity * 0.65;
        if (sameGooglePlace) score += 0.5;
        if (distanceMeters !== null) score += Math.max(0, 0.25 * (1 - distanceMeters / 500));
        if (addressSimilarity !== null) score += addressSimilarity * 0.1;
        score = Math.min(1, score);

        const reasons: string[] = [];
        if (sameGooglePlace) reasons.push('AYNI_GOOGLE_PLACE_ID');
        if (nameSimilarity >= 0.92) reasons.push('ÇOK_BENZER_ISIM');
        if (likelyByLocation) reasons.push('YAKIN_KONUM_VE_BENZER_ISIM');
        if (likelyByAddress) reasons.push('BENZER_ADRES');

        suggestions.push({
          score: Number(score.toFixed(3)),
          reasons,
          nameSimilarity: Number(nameSimilarity.toFixed(3)),
          addressSimilarity:
            addressSimilarity === null ? null : Number(addressSimilarity.toFixed(3)),
          distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters),
          sameRegion: left.regionId === right.regionId,
          left: this.pointSummary(left),
          right: this.pointSummary(right),
        });
      }
    }

    suggestions.sort((a, b) => Number(b.score) - Number(a.score));
    return {
      scannedPoints: points.length,
      suggestionCount: suggestions.length,
      items: suggestions.slice(0, Math.min(Math.max(limit, 1), 500)),
      autoMerged: 0,
    };
  }

  private async requireAdmin(userId: string) {
    const admin = await this.prisma.user.findFirst({
      where: { id: userId, active: true, role: UserRole.ADMIN },
      select: { id: true, name: true },
    });
    if (!admin) throw new ForbiddenException('Bu işlemi yalnızca admin yapabilir');
    return admin;
  }

  private pointSummary(point: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    regionId: string;
    status: unknown;
    googlePlaceId: string | null;
    googleBusinessName: string | null;
    aliases: Array<{ alias: string }>;
  }) {
    return {
      id: point.id,
      code: point.code,
      name: point.name,
      aliases: point.aliases.map((item) => item.alias),
      address: point.address,
      regionId: point.regionId,
      status: point.status,
      googlePlaceId: point.googlePlaceId,
      googleBusinessName: point.googleBusinessName,
    };
  }

  private pointDistance(
    a: { canonicalLatitude: Prisma.Decimal | null; canonicalLongitude: Prisma.Decimal | null },
    b: { canonicalLatitude: Prisma.Decimal | null; canonicalLongitude: Prisma.Decimal | null },
  ) {
    if (
      a.canonicalLatitude === null ||
      a.canonicalLongitude === null ||
      b.canonicalLatitude === null ||
      b.canonicalLongitude === null
    ) {
      return null;
    }
    const lat1 = Number(a.canonicalLatitude) * (Math.PI / 180);
    const lat2 = Number(b.canonicalLatitude) * (Math.PI / 180);
    const deltaLat = lat2 - lat1;
    const deltaLon = (Number(b.canonicalLongitude) - Number(a.canonicalLongitude)) * (Math.PI / 180);
    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  private similarity(a: string, b: string) {
    const left = this.normalize(a);
    const right = this.normalize(b);
    if (left === right) return 1;
    if (!left || !right) return 0;
    const leftPairs = this.bigrams(left);
    const rightPairs = this.bigrams(right);
    if (leftPairs.length === 0 || rightPairs.length === 0) return 0;
    const counts = new Map<string, number>();
    for (const pair of leftPairs) counts.set(pair, (counts.get(pair) ?? 0) + 1);
    let overlap = 0;
    for (const pair of rightPairs) {
      const count = counts.get(pair) ?? 0;
      if (count > 0) {
        overlap += 1;
        counts.set(pair, count - 1);
      }
    }
    return (2 * overlap) / (leftPairs.length + rightPairs.length);
  }

  private bigrams(value: string) {
    if (value.length < 2) return [value];
    const pairs: string[] = [];
    for (let index = 0; index < value.length - 1; index += 1) {
      pairs.push(value.slice(index, index + 2));
    }
    return pairs;
  }

  private normalize(value: string) {
    return value
      .toLocaleLowerCase('tr-TR')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private validDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} geçersiz`);
    return date;
  }

  private validateSchedule(type: MaintenanceType, week?: number, smartcleanReferenceAt?: string) {
    if (type === MaintenanceType.STANDARD && ![1, 2].includes(week ?? 0)) {
      throw new BadRequestException('Standard nokta için maintenanceWeek 1 veya 2 olmalıdır');
    }

    if (type === MaintenanceType.SMARTCLEAN && !smartcleanReferenceAt) {
      throw new BadRequestException('SmartClean nokta için referans tarihi zorunludur');
    }
    if (type === MaintenanceType.SMARTCLEAN && smartcleanReferenceAt) {
      this.validDate(smartcleanReferenceAt, 'smartcleanReferenceAt');
    }
  }
}
