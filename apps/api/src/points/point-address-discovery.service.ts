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
  private readonly regionFallbacks: Record<string, string> = {
    'KÜÇÜKPARK': 'Bornova', ALSANCAK: 'Konak', ÇANKAYA: 'Konak', KEMERALTI: 'Konak',
    EŞREFPAŞA: 'Konak', İNCİRALTI: 'Balçova', SAHİLEVLERİ: 'Narlıdere', MAVİŞEHİR: 'Karşıyaka',
    BOSTANLI: 'Karşıyaka', ÇAMDİBİ: 'Bornova', MYVIA: 'Bornova', HATAY: 'Konak',
  };
  private readonly annotationOnly = new Set([
    'lokasyon', 'seyyar', 'yeni adi', 'eski adi', 'yeni ismi', 'eski ismi', 'sube', 'sanal', 'gecici',
  ]);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  enqueue(pointId: string) {
    if (this.inFlight.has(pointId)) return;
    this.inFlight.add(pointId);
    setImmediate(() => void this.discover(pointId).finally(() => this.inFlight.delete(pointId)));
  }

  async discover(pointId: string) {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY')?.trim();
    if (!key) { this.logger.warn('GOOGLE_MAPS_API_KEY tanımlı değil; otomatik adres keşfi atlandı'); return { status: 'DISABLED' as const }; }
    const point = await this.prisma.point.findFirst({ where: { id: pointId, deletedAt: null }, include: { region: true } });
    if (!point) return { status: 'NOT_FOUND' as const };

    const all: RankedCandidate[] = [];
    for (const query of this.buildQueries(point.name, point.region?.name)) {
      for (const candidate of await this.searchGoogle(key, query)) all.push({ candidate, score: this.score(point.name, point.region?.name, candidate), query });
    }
    if (!all.length) return { status: 'NO_MATCH' as const };

    const deduped = [...new Map(all.sort((a, b) => b.score - a.score).map((item) => [item.candidate.id ?? `${item.candidate.displayName?.text}|${item.candidate.formattedAddress}`, item])).values()].sort((a, b) => b.score - a.score);
    const best = deduped[0], second = deduped[1];
    if (!best || best.score < 70 || (second && best.score - second.score < 10)) return { status: 'AMBIGUOUS' as const, confidence: best?.score ?? 0 };
    const lat = best.candidate.location?.latitude, lng = best.candidate.location?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'NO_COORDINATES' as const };

    await this.prisma.point.update({ where: { id: point.id }, data: {
      address: best.candidate.formattedAddress ?? point.address, canonicalLatitude: lat, canonicalLongitude: lng,
      locationSource: LocationSource.GOOGLE_MATCH, locationConfidence: best.score,
      googlePlaceId: best.candidate.id ?? null, googleBusinessName: best.candidate.displayName?.text ?? null,
    } });
    return { status: 'AUTO_DISCOVERED' as const, confidence: best.score, query: best.query };
  }

  async discoverMissing(limit = 25) {
    const points = await this.prisma.point.findMany({ where: { deletedAt: null, status: 'ACTIVE', locationSource: LocationSource.UNKNOWN }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: Math.min(Math.max(limit, 1), 100) });
    const results = [];
    for (const point of points) {
      try { results.push({ pointId: point.id, ...(await this.discover(point.id)) }); }
      catch (error) { results.push({ pointId: point.id, status: 'ERROR', error: error instanceof Error ? error.message : String(error) }); }
    }
    return { count: results.length, results };
  }

  private async searchGoogle(key: string, textQuery: string) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName.text,places.formattedAddress,places.location',
    }, body: JSON.stringify({ textQuery, languageCode: 'tr', regionCode: 'TR', pageSize: 5 }) });
    if (!response.ok) throw new Error(`Google Places New HTTP ${response.status}`);
    return ((await response.json()) as { places?: GoogleCandidate[] }).places ?? [];
  }

  private buildQueries(name: string, regionName?: string) {
    const variants = this.nameVariants(name, regionName);
    const areas = new Set<string>();
    if (regionName) areas.add(regionName);
    const fallback = regionName ? this.regionFallbacks[regionName.toLocaleUpperCase('tr-TR')] : undefined;
    if (fallback) areas.add(fallback);
    if (!areas.size) areas.add('İzmir');
    const queries = new Set<string>();
    for (const variant of variants) for (const area of areas) queries.add([variant, area, 'İzmir', 'Türkiye'].join(' '));
    return [...queries];
  }

  private nameVariants(name: string, regionName?: string) {
    const variants = new Set<string>();
    const baseName = name.replace(/\(([^)]+)\)/g, (_whole, raw: string) => {
      const cleaned = this.cleanParenthetical(raw);
      return cleaned ? `(${cleaned})` : ' ';
    }).replace(/\s+/g, ' ').trim();
    if (baseName) variants.add(baseName);

    for (const match of name.matchAll(/\(([^)]+)\)/g)) {
      const cleaned = this.cleanParenthetical(match[1] ?? '');
      if (cleaned) variants.add(cleaned);
    }

    const withoutParentheses = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (withoutParentheses) variants.add(withoutParentheses);

    if (regionName && withoutParentheses) {
      const nameTokens = withoutParentheses.split(/\s+/);
      const regionTokenCount = regionName.trim().split(/\s+/).length;
      if (nameTokens.length > regionTokenCount) {
        const trailing = nameTokens.slice(-regionTokenCount).join(' ');
        if (this.normalize(trailing) === this.normalize(regionName)) {
          const withoutTrailingRegion = nameTokens.slice(0, -regionTokenCount).join(' ').trim();
          if (withoutTrailingRegion) variants.add(withoutTrailingRegion);
        }
      }
    }

    return [...variants];
  }

  private cleanParenthetical(value: string) {
    let cleaned = value.trim();
    const suffixes = [
      /\byeni\s+ad[ıi]\b/gi, /\beski\s+ad[ıi]\b/gi,
      /\byeni\s+ismi\b/gi, /\beski\s+ismi\b/gi,
      /\blokasyon\b/gi, /\bseyyar\b/gi, /\bşube\b/gi, /\bsube\b/gi,
      /\bsanal\b/gi, /\bgeçici\b/gi, /\bgecici\b/gi,
    ];
    for (const pattern of suffixes) cleaned = cleaned.replace(pattern, ' ');
    cleaned = cleaned.replace(/[\-–—,:;]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    if (this.annotationOnly.has(this.normalize(cleaned))) return '';
    return cleaned;
  }

  private score(pointName: string, regionName: string | undefined, candidate: GoogleCandidate) {
    const expectedVariants = this.nameVariants(pointName, regionName).map((x) => this.normalize(x)).filter(Boolean);
    const actual = this.normalize(candidate.displayName?.text ?? ''), address = this.normalize(candidate.formattedAddress ?? '');
    const nameScore = Math.max(...expectedVariants.map((expected) => this.nameScore(expected, actual)));
    const region = regionName ? this.normalize(regionName) : '';
    const fallback = regionName ? this.normalize(this.regionFallbacks[regionName.toLocaleUpperCase('tr-TR')] ?? '') : '';
    const exactRegionMatch = !!region && address.includes(region), fallbackMatch = !!fallback && address.includes(fallback);
    let score = nameScore;
    if (exactRegionMatch) score += 25;
    else if (fallbackMatch) score += 20;
    else if (region) score -= 35;
    if (address.includes('izmir')) score += 5;
    return Math.max(0, Math.min(score, 100));
  }

  private nameScore(expected: string, actual: string) {
    if (expected === actual) return 65;
    const expectedTokens = new Set(expected.split(' ').filter((x) => x.length > 2)), actualTokens = new Set(actual.split(' ').filter((x) => x.length > 2));
    const overlap = [...expectedTokens].filter((x) => actualTokens.has(x)).length;
    return Math.min(60, Math.round((overlap / Math.max(expectedTokens.size, 1)) * 60));
  }

  private normalize(value: string) {
    return value.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
  }
}
