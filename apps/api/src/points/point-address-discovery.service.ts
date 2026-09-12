import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type GoogleCandidate = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
};

@Injectable()
export class PointAddressDiscoveryService {
  private readonly logger = new Logger(PointAddressDiscoveryService.name);
  private readonly inFlight = new Set<string>();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  enqueue(pointId: string) {
    if (this.inFlight.has(pointId)) return;
    this.inFlight.add(pointId);
    setImmediate(() => void this.discover(pointId).finally(() => this.inFlight.delete(pointId)));
  }

  async discover(pointId: string) {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY')?.trim();
    if (!key) {
      this.logger.warn('GOOGLE_MAPS_API_KEY tanımlı değil; otomatik adres keşfi atlandı');
      return { status: 'DISABLED' as const };
    }
    const point = await this.prisma.point.findFirst({
      where: { id: pointId, deletedAt: null },
      include: { region: true },
    });
    if (!point) return { status: 'NOT_FOUND' as const };

    const query = [point.name, point.region?.name, 'Türkiye'].filter(Boolean).join(' ');
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('language', 'tr');
    url.searchParams.set('region', 'tr');
    url.searchParams.set('key', key);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Places HTTP ${response.status}`);
    const body = (await response.json()) as { status?: string; results?: GoogleCandidate[] };
    const candidates = body.results ?? [];
    if (!candidates.length) return { status: 'NO_MATCH' as const };

    const ranked = candidates.map((candidate) => ({ candidate, score: this.score(point.name, point.region?.name, candidate) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.score < 55 || (second && best.score - second.score < 8)) {
      return { status: 'AMBIGUOUS' as const, confidence: best?.score ?? 0 };
    }

    const lat = best.candidate.geometry?.location?.lat;
    const lng = best.candidate.geometry?.location?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'NO_COORDINATES' as const };

    await this.prisma.point.update({
      where: { id: point.id },
      data: {
        address: best.candidate.formatted_address ?? point.address,
        canonicalLatitude: lat,
        canonicalLongitude: lng,
        locationSource: LocationSource.GOOGLE_MATCH,
        locationConfidence: best.score,
        googlePlaceId: best.candidate.place_id ?? null,
        googleBusinessName: best.candidate.name ?? null,
      },
    });
    return { status: 'AUTO_DISCOVERED' as const, confidence: best.score };
  }

  async discoverMissing(limit = 25) {
    const points = await this.prisma.point.findMany({
      where: { deletedAt: null, status: 'ACTIVE', locationSource: LocationSource.UNKNOWN },
      select: { id: true }, orderBy: { createdAt: 'asc' }, take: Math.min(Math.max(limit, 1), 100),
    });
    const results = [];
    for (const point of points) {
      try { results.push({ pointId: point.id, ...(await this.discover(point.id)) }); }
      catch (error) { results.push({ pointId: point.id, status: 'ERROR', error: error instanceof Error ? error.message : String(error) }); }
    }
    return { count: results.length, results };
  }

  private score(pointName: string, regionName: string | undefined, candidate: GoogleCandidate) {
    const expected = this.normalize(pointName);
    const actual = this.normalize(candidate.name ?? '');
    const address = this.normalize(candidate.formatted_address ?? '');
    let score = 0;
    if (expected === actual) score += 70;
    else {
      const expectedTokens = new Set(expected.split(' ').filter((x) => x.length > 2));
      const actualTokens = new Set(actual.split(' ').filter((x) => x.length > 2));
      const overlap = [...expectedTokens].filter((x) => actualTokens.has(x)).length;
      score += Math.min(60, Math.round((overlap / Math.max(expectedTokens.size, 1)) * 60));
    }
    if (regionName && address.includes(this.normalize(regionName))) score += 25;
    if (/turkiye|turkey/.test(address)) score += 5;
    return Math.min(score, 100);
  }

  private normalize(value: string) {
    return value.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
  }
}
