import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type GoogleCandidate = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

type RankedCandidate = { candidate: GoogleCandidate; score: number; query: string };

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
    const point = await this.prisma.point.findFirst({ where: { id: pointId, deletedAt: null }, include: { region: true } });
    if (!point) return { status: 'NOT_FOUND' as const };

    const queries = this.buildQueries(point.name, point.region?.name);
    const all: RankedCandidate[] = [];
    for (const query of queries) {
      for (const candidate of await this.searchGoogle(key, query)) {
        all.push({ candidate, score: this.score(point.name, point.region?.name, candidate), query });
      }
    }
    if (!all.length) return { status: 'NO_MATCH' as const };

    const deduped = [...new Map(all.sort((a, b) => b.score - a.score).map((item) => [item.candidate.id ?? `${item.candidate.displayName?.text}|${item.candidate.formattedAddress}`, item])).values()]
      .sort((a, b) => b.score - a.score);
    const best = deduped[0];
    const second = deduped[1];
    if (!best || best.score < 70 || (second && best.score - second.score < 10)) {
      return { status: 'AMBIGUOUS' as const, confidence: best?.score ?? 0 };
    }

    const lat = best.candidate.location?.latitude;
    const lng = best.candidate.location?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'NO_COORDINATES' as const };

    await this.prisma.point.update({
      where: { id: point.id },
      data: {
        address: best.candidate.formattedAddress ?? point.address,
        canonicalLatitude: lat,
        canonicalLongitude: lng,
        locationSource: LocationSource.GOOGLE_MATCH,
        locationConfidence: best.score,
        googlePlaceId: best.candidate.id ?? null,
        googleBusinessName: best.candidate.displayName?.text ?? null,
      },
    });
    return { status: 'AUTO_DISCOVERED' as const, confidence: best.score, query: best.query };
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

  private async searchGoogle(key: string, textQuery: string) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName.text,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery, languageCode: 'tr', regionCode: 'TR', pageSize: 5 }),
    });
    if (!response.ok) throw new Error(`Google Places New HTTP ${response.status}`);
    return ((await response.json()) as { places?: GoogleCandidate[] }).places ?? [];
  }

  private buildQueries(name: string, regionName?: string) {
    const variants = new Set<string>([name.trim()]);
    for (const match of name.matchAll(/\(([^)]+)\)/g)) if (match[1]?.trim()) variants.add(match[1].trim());
    const withoutParentheses = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (withoutParentheses) variants.add(withoutParentheses);
    return [...variants].map((variant) => [variant, regionName, 'İzmir', 'Türkiye'].filter(Boolean).join(' '));
  }

  private score(pointName: string, regionName: string | undefined, candidate: GoogleCandidate) {
    const expectedVariants = [pointName, ...[...pointName.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]), pointName.replace(/\([^)]*\)/g, ' ')]
      .map((x) => this.normalize(x)).filter(Boolean);
    const actual = this.normalize(candidate.displayName?.text ?? '');
    const address = this.normalize(candidate.formattedAddress ?? '');
    const nameScore = Math.max(...expectedVariants.map((expected) => this.nameScore(expected, actual)));
    const region = regionName ? this.normalize(regionName) : '';
    const regionMatch = !region || address.includes(region);
    let score = nameScore;
    if (regionMatch && region) score += 25;
    else if (region) score -= 35;
    if (address.includes('izmir')) score += 5;
    if (/turkiye|turkey/.test(address)) score += 5;
    return Math.max(0, Math.min(score, 100));
  }

  private nameScore(expected: string, actual: string) {
    if (expected === actual) return 65;
    const expectedTokens = new Set(expected.split(' ').filter((x) => x.length > 2));
    const actualTokens = new Set(actual.split(' ').filter((x) => x.length > 2));
    const overlap = [...expectedTokens].filter((x) => actualTokens.has(x)).length;
    return Math.min(60, Math.round((overlap / Math.max(expectedTokens.size, 1)) * 60));
  }

  private normalize(value: string) {
    return value.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
  }
}
