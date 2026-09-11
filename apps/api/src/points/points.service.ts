import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MaintenanceType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { AddPointAliasDto } from './dto/add-point-alias.dto';
import { CreatePointDto } from './dto/create-point.dto';
import { UpdatePointDto } from './dto/update-point.dto';
import { ImportPointsDto } from './dto/import-points.dto';
import { UpdatePointEquipmentDto } from './dto/update-point-equipment.dto';

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService, private readonly assignments: AssignmentsService) {}

  list() {
    return this.prisma.point.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        aliases: { orderBy: { createdAt: 'asc' } },
        region: {
          include: {
            technician: { select: { id: true, name: true, username: true, active: true } },
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

  async create(adminUserId: string, dto: CreatePointDto) {
    await this.requireAdmin(adminUserId);
    await this.assertUniqueCode(dto.code);
    this.validateSchedule(dto.maintenanceType, dto.maintenanceWeek, dto.smartcleanReferenceAt);

    const point = await this.prisma.point.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        address: null,
        regionId: dto.regionId,
        status: dto.status,
        maintenanceType: dto.maintenanceType,
        maintenanceWeek: dto.maintenanceWeek,
        smartcleanReferenceAt:
          dto.maintenanceType === MaintenanceType.SMARTCLEAN && dto.smartcleanReferenceAt
            ? this.validDate(dto.smartcleanReferenceAt, 'smartcleanReferenceAt')
            : null,
      },
    });
    await this.audit(adminUserId, point.id, 'POINT_CREATED', null, point);
    return point;
  }

  async update(adminUserId: string, id: string, dto: UpdatePointDto) {
    await this.requireAdmin(adminUserId);
    const existing = await this.get(id);
    if (dto.code !== undefined) await this.assertUniqueCode(dto.code, id);
    const maintenanceType = dto.maintenanceType ?? existing.maintenanceType;
    const maintenanceWeek = dto.maintenanceWeek ?? existing.maintenanceWeek ?? undefined;
    const smartcleanReferenceAt = dto.smartcleanReferenceAt ?? existing.smartcleanReferenceAt?.toISOString();
    const scheduleTouched =
      dto.maintenanceType !== undefined ||
      dto.maintenanceWeek !== undefined ||
      dto.smartcleanReferenceAt !== undefined;

    if (scheduleTouched) {
      this.validateSchedule(maintenanceType, maintenanceWeek, smartcleanReferenceAt);
    }

    const data: Prisma.PointUpdateInput = {
      ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.regionId !== undefined ? { region: { connect: { id: dto.regionId } } } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(scheduleTouched
        ? {
            maintenanceType,
            maintenanceWeek,
            smartcleanReferenceAt:
              maintenanceType === MaintenanceType.SMARTCLEAN && smartcleanReferenceAt
                ? this.validDate(smartcleanReferenceAt, 'smartcleanReferenceAt')
                : null,
          }
        : {}),
    };

    const updated = await this.prisma.point.update({ where: { id }, data });
    await this.audit(adminUserId, id, 'POINT_UPDATED', existing, updated);
    return updated;
  }

  async setupPending() {
    const points = await this.prisma.point.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: [{ name: 'asc' }],
      include: { region: { include: { technician: { select: { id: true, name: true, username: true, active: true } } } } },
    });
    const allCodes = await this.prisma.point.findMany({ where: { deletedAt: null }, select: { code: true } });
    const codeCounts = new Map<string, number>();
    for (const point of allCodes) codeCounts.set(point.code.trim(), (codeCounts.get(point.code.trim()) ?? 0) + 1);
    const items = points.flatMap((point) => {
      const reasons: string[] = [];
      if (/^GECICI-/i.test(point.code.trim())) reasons.push('TEMPORARY_CODE');
      if (!point.region) reasons.push('REGION_MISSING');
      else if (!point.region.technician || !point.region.technician.active) reasons.push('TECHNICIAN_MISSING');
      if (point.maintenanceType === MaintenanceType.STANDARD && ![1, 2].includes(point.maintenanceWeek ?? 0)) reasons.push('STANDARD_WEEK_MISSING');
      if (point.maintenanceType === MaintenanceType.SMARTCLEAN && ![1, 2].includes(point.maintenanceWeek ?? 0)) reasons.push('SMARTCLEAN_WEEK_MISSING');
      if (point.maintenanceType === MaintenanceType.SMARTCLEAN && !point.smartcleanReferenceAt) reasons.push('SMARTCLEAN_REFERENCE_MISSING');
      if ((codeCounts.get(point.code.trim()) ?? 0) > 1) reasons.push('DUPLICATE_CODE');
      return reasons.length ? [{ ...point, setupReasons: reasons }] : [];
    });
    return { count: items.length, items };
  }

  async importPoints(adminUserId: string, dto: ImportPointsDto) {
    await this.requireAdmin(adminUserId);
    let imported = 0, skippedPassiveMissingCode = 0, skippedExisting = 0, temporaryCodes = 0;
    const createdIds: string[] = [];
    for (const raw of dto.rows) {
      const row = raw as Record<string, unknown>;
      const statusText = String(row.status ?? row['Durum'] ?? 'ACTIVE').trim().toUpperCase();
      const status = statusText === 'PASIF' || statusText === 'PASİF' || statusText === 'PASSIVE' ? 'PASSIVE' : statusText === 'CANCELLED' || statusText === 'IPTAL' || statusText === 'İPTAL' ? 'CANCELLED' : 'ACTIVE';
      let code = String(row.customerNo ?? row['Müşteri No'] ?? '').trim();
      const name = String(row.customerName ?? row['Müşteri Adı'] ?? '').trim();
      if (!name) throw new BadRequestException('Import satırında müşteri adı zorunludur');
      if (!code && status === 'PASSIVE') { skippedPassiveMissingCode += 1; continue; }
      if (!code) { code = await this.nextTemporaryCode(); temporaryCodes += 1; }
      const regionName = String(row.region ?? row['Bölge'] ?? '').trim();
      const technicianName = String(row.technician ?? row['Teknisyen'] ?? '').trim();
      let regionId: string | null = null;
      if (regionName) {
        const technician = technicianName ? await this.prisma.user.findFirst({ where: { name: { equals: technicianName, mode: 'insensitive' }, role: UserRole.TECHNICIAN, active: true } }) : null;
        const region = await this.prisma.region.upsert({ where: { name: regionName }, update: technician ? { technicianId: technician.id } : {}, create: { name: regionName, technicianId: technician?.id ?? null } });
        regionId = region.id;
      }
      const smartRaw = row.smartClean ?? row['SmartClean'] ?? row['Smartclean Var'];
      const smart = smartRaw === true || /^(VAR|VAR 1|EVET|YES|TRUE|1)$/i.test(String(smartRaw ?? '').trim());
      const weekRaw = row.maintenanceWeek ?? row['Rut Haftası'];
      const week = Number(weekRaw);
      const maintenanceWeek = [1,2].includes(week) ? week : null;
      const maintenanceType = smart ? MaintenanceType.SMARTCLEAN : MaintenanceType.STANDARD;
      const existingExact = await this.prisma.point.findFirst({
        where: { code, name, regionId, status, maintenanceType, maintenanceWeek, deletedAt: null },
        select: { id: true },
      });
      if (existingExact) { skippedExisting += 1; continue; }
      const point = await this.prisma.point.create({ data: { code, name, regionId, status, maintenanceType, maintenanceWeek, smartcleanReferenceAt: null } });
      await this.audit(adminUserId, point.id, 'POINT_IMPORTED', null, point);
      createdIds.push(point.id); imported += 1;
    }
    return { imported, skippedPassiveMissingCode, skippedExisting, temporaryCodes, createdIds };
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

  async myCustomers(technicianId: string) {
    await this.requireTechnician(technicianId);
    const points = await this.prisma.point.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true, code: true, name: true, address: true, regionId: true,
        canonicalLatitude: true, canonicalLongitude: true, locationSource: true, locationConfidence: true,
        coolerCount: true, towerCount: true, tapCount: true, smarttapCount: true,
        equipmentVerifiedAt: true, equipmentVerifiedById: true,
        region: { select: { id: true, name: true } },
      },
      orderBy: [{ name: 'asc' }],
    });
    const resolved = await this.assignments.resolveMany(points.map((point) => point.id), new Date());
    return points.filter((point) => resolved.get(point.id)?.technicianId === technicianId).map((point) => ({
      ...point,
      canonicalLatitude: point.canonicalLatitude === null ? null : Number(point.canonicalLatitude),
      canonicalLongitude: point.canonicalLongitude === null ? null : Number(point.canonicalLongitude),
      equipmentComplete: [point.coolerCount, point.towerCount, point.tapCount, point.smarttapCount].every((value) => value !== null),
      assignmentSource: resolved.get(point.id)?.source ?? 'REGION',
    }));
  }

  async updateEquipment(technicianId: string, pointId: string, dto: UpdatePointEquipmentDto) {
    await this.requireTechnician(technicianId);
    const point = await this.prisma.point.findFirst({ where: { id: pointId, deletedAt: null, status: 'ACTIVE' } });
    if (!point) throw new NotFoundException('Nokta bulunamadı');
    const assignment = await this.assignments.effectiveForPoint(pointId, new Date());
    if (assignment.technicianId !== technicianId) throw new ForbiddenException('Bu müşteri sana atanmış değil');
    const oldValue = { coolerCount: point.coolerCount, towerCount: point.towerCount, tapCount: point.tapCount, smarttapCount: point.smarttapCount };
    const newValue = { coolerCount: dto.coolerCount, towerCount: dto.towerCount, tapCount: dto.tapCount, smarttapCount: dto.smarttapCount };
    const updated = await this.prisma.point.update({
      where: { id: pointId },
      data: { ...newValue, equipmentVerifiedAt: new Date(), equipmentVerifiedById: technicianId },
    });
    await this.prisma.adminAuditLog.create({ data: { actorId: technicianId, entityType: 'POINT_EQUIPMENT', entityId: pointId, action: 'TECHNICIAN_VERIFIED', oldValue, newValue } });
    return updated;
  }

  private async requireTechnician(userId: string) {
    const technician = await this.prisma.user.findFirst({ where: { id: userId, active: true, role: UserRole.TECHNICIAN }, select: { id: true } });
    if (!technician) throw new ForbiddenException('Aktif teknisyen hesabı gerekli');
    return technician;
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
    regionId: string | null;
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

  private async assertUniqueCode(code: string, excludeId?: string) {
    const normalized = code.trim();
    if (!normalized) throw new BadRequestException('Müşteri numarası boş olamaz');
    const duplicate = await this.prisma.point.findFirst({ where: { code: normalized, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (duplicate) throw new BadRequestException('Bu müşteri numarası başka bir noktada kullanılıyor');
  }

  private async nextTemporaryCode() {
    const rows = await this.prisma.point.findMany({ where: { code: { startsWith: 'GECICI-' } }, select: { code: true } });
    const max = rows.reduce((acc, row) => Math.max(acc, Number(row.code.match(/^GECICI-(\d+)$/i)?.[1] ?? 0)), 0);
    return `GECICI-${String(max + 1).padStart(4, '0')}`;
  }

  private async audit(actorId: string, entityId: string, action: string, oldValue: unknown, newValue: unknown) {
    await this.prisma.adminAuditLog.create({ data: { actorId, entityType: 'Point', entityId, action, oldValue: oldValue as Prisma.InputJsonValue, newValue: newValue as Prisma.InputJsonValue } });
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

    if (type === MaintenanceType.SMARTCLEAN && ![1, 2].includes(week ?? 0)) {
      throw new BadRequestException('SmartClean nokta için maintenanceWeek 1 veya 2 olmalıdır');
    }

    if (type === MaintenanceType.SMARTCLEAN && !smartcleanReferenceAt) {
      throw new BadRequestException('SmartClean nokta için referans tarihi zorunludur');
    }
    if (type === MaintenanceType.SMARTCLEAN && smartcleanReferenceAt) {
      this.validDate(smartcleanReferenceAt, 'smartcleanReferenceAt');
    }
  }
}
