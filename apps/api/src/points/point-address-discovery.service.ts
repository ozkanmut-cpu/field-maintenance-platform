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
type RankedCandidate = { candidate: GoogleCandidate; score: number; query: string; regionDistance: number };
type GeoAnchor = { latitude: number; longitude: number };

@Injectable()
export class PointAddressDiscoveryService {
  private readonly logger = new Logger(PointAddressDiscoveryService.name);
  private readonly inFlight = new Set<string>();
  private readonly regionFallbacks: Record<string, string> = {
    'KÜÇÜKPARK': 'Bornova', ALSANCAK: 'Konak', ÇANKAYA: 'Konak', KEMERALTI: 'Konak',
    EŞREFPAŞA: 'Konak', İNCİRALTI: 'Balçova', SAHİLEVLERİ: 'Narlıdere', MAVİŞEHİR: 'Karşıyaka',
    BOSTANLI: 'Karşıyaka', ÇAMDİBİ: 'Bornova', MYVIA: 'Bornova', HATAY: 'Konak',
    MORDOĞAN: 'Karaburun',
  };
  private readonly annotationOnly = new Set([
    'lokasyon', 'seyyar', 'yeni adi', 'eski adi', 'yeni ismi', 'eski ismi', 'sube', 'sanal', 'gecici',
  ]);
  private readonly businessTypeTokens = new Set([
    'bar', 'pub', 'cafe', 'kafe', 'rest', 'restaurant', 'restoran', 'otel', 'hotel', 'butik', 'club', 'kulubu', 'kulup', 'birahane', 'birahanesi', 'disco',
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
    if (point.locationSource === LocationSource.GOOGLE_MATCH && point.googlePlaceId) {
      return { status: 'PRESERVED' as const, confidence: point.locationConfidence ?? 0 };
    }

    const regionAnchors: GeoAnchor[] = point.regionId ? (await this.prisma.point.findMany({
      where: {
        regionId: point.regionId, id: { not: point.id }, deletedAt: null,
        locationSource: LocationSource.GOOGLE_MATCH, locationConfidence: { gte: 80 },
        canonicalLatitude: { not: null }, canonicalLongitude: { not: null },
      },
      select: { canonicalLatitude: true, canonicalLongitude: true }, take: 100,
    })).map((anchor) => ({ latitude: Number(anchor.canonicalLatitude), longitude: Number(anchor.canonicalLongitude) })) : [];

    const pointNames = [point.name, point.sapName].filter((name): name is string => !!name?.trim());
    const all: RankedCandidate[] = [];
    const queries = new Set(pointNames.flatMap((name) => this.buildQueries(name, point.region?.name)));
    for (const query of queries) {
      for (const candidate of await this.searchGoogle(key, query)) {
        if (!this.isPlausibleRegionCandidate(point.region?.name, candidate, regionAnchors)) continue;
        const score = this.combinedScore(point.name, point.sapName, point.region?.name, candidate, regionAnchors);
        all.push({ candidate, score, query, regionDistance: this.regionAnchorDistance(candidate, regionAnchors) });
      }
    }
    if (!all.length) return { status: 'NO_MATCH' as const };

    const deduped = [...new Map(all.sort((a, b) => b.score - a.score || a.regionDistance - b.regionDistance).map((item) => [item.candidate.id ?? `${item.candidate.displayName?.text}|${item.candidate.formattedAddress}`, item])).values()];
    for (const item of deduped) {
      const identity = this.identityStrength(point.name, point.sapName, point.region?.name, item.candidate);
      const transition = deduped.some((other) => other !== item
        && this.isSapTransitionCandidate(point.name, point.sapName, point.region?.name, item.candidate, other.candidate));
      const addressQualifier = this.hasAddressQualifierMatch(point.name, item.candidate) ? 5 : 0;
      const identityScore = identity >= 3 ? 95 + addressQualifier : identity >= 2 ? 90 + addressQualifier : 0;
      item.score = Math.max(item.score, transition ? 100 : 0, identityScore);
    }
    deduped.sort((a, b) => b.score - a.score || a.regionDistance - b.regionDistance);
    const best = deduped[0], second = deduped[1];
    const closeCompetitor = !!second && best.score - second.score < 10;
    const samePhysicalPlace = !!second && this.isSamePhysicalPlace(best.candidate, second.candidate);
    const colocatedAliasPair = !!second && this.isColocatedHyphenAliasPair(point.name, best.candidate, second.candidate);
    const bestIdentity = this.identityStrength(point.name, point.sapName, point.region?.name, best.candidate);
    const secondIdentity = second ? this.identityStrength(point.name, point.sapName, point.region?.name, second.candidate) : 0;
    const decisiveIdentity = bestIdentity >= 2 && bestIdentity > secondIdentity;
    const identityScore = bestIdentity >= 3 ? 95 : bestIdentity >= 2 ? 90 : 0;
    const effectiveBestScore = Math.max(best.score, colocatedAliasPair ? 75 : 0, identityScore);
    const exactNameAdvantage = !!second && effectiveBestScore >= 90
      && pointNames.some((name) => this.hasExactExpectedName(name, point.region?.name, best.candidate))
      && !pointNames.some((name) => this.hasExactExpectedName(name, point.region?.name, second.candidate));
    const addressQualifierAdvantage = !!second
      && this.hasAddressQualifierMatch(point.name, best.candidate)
      && !this.hasAddressQualifierMatch(point.name, second.candidate);
    const geographyAdvantage = !!second && this.hasDecisiveGeography(point.region?.name, best, second, bestIdentity);
    if (!best || effectiveBestScore < 70 || (closeCompetitor && !samePhysicalPlace && !colocatedAliasPair && !exactNameAdvantage && !decisiveIdentity && !addressQualifierAdvantage && !geographyAdvantage)) return { status: 'AMBIGUOUS' as const, confidence: effectiveBestScore ?? 0 };
    best.score = effectiveBestScore;
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
    const cleanedName = name.replace(/\blokasyon\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const baseName = cleanedName.replace(/\(([^)]+)\)/g, (_whole, raw: string) => {
      const cleaned = this.cleanParenthetical(raw);
      return cleaned ? `(${cleaned})` : ' ';
    }).replace(/\s+/g, ' ').trim();
    if (baseName) variants.add(baseName);

    for (const match of cleanedName.matchAll(/\(([^)]+)\)/g)) {
      const cleaned = this.cleanParenthetical(match[1] ?? '');
      if (cleaned) variants.add(cleaned);
    }

    const withoutParentheses = cleanedName.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (withoutParentheses) variants.add(withoutParentheses);

    for (const part of withoutParentheses.split(/\s*[-–—]\s*/).map((x) => x.trim()).filter(Boolean)) {
      if (part !== withoutParentheses && this.normalize(part).length >= 4) variants.add(part);
    }

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

  private primaryNameVariants(name: string, regionName?: string) {
    const cleanedName = name.replace(/\blokasyon\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const withoutParentheses = cleanedName.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const variants = new Set<string>();
    if (withoutParentheses) variants.add(withoutParentheses);
    if (regionName && withoutParentheses) {
      const nameTokens = withoutParentheses.split(/\s+/);
      const regionTokenCount = regionName.trim().split(/\s+/).length;
      if (nameTokens.length > regionTokenCount) {
        const trailing = nameTokens.slice(-regionTokenCount).join(' ');
        if (this.normalize(trailing) === this.normalize(regionName)) {
          const stripped = nameTokens.slice(0, -regionTokenCount).join(' ').trim();
          if (stripped) variants.add(stripped);
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

  private isPlausibleRegionCandidate(regionName: string | undefined, candidate: GoogleCandidate, regionAnchors: GeoAnchor[] = []) {
    if (!regionName) return true;
    const address = this.normalize(candidate.formattedAddress ?? '');
    const region = this.normalize(regionName);
    const fallback = this.normalize(this.regionFallbacks[regionName.toLocaleUpperCase('tr-TR')] ?? '');
    const lat = candidate.location?.latitude, lng = candidate.location?.longitude;
    const nearestAnchorMeters = Number.isFinite(lat) && Number.isFinite(lng) && regionAnchors.length >= 3
      ? Math.min(...regionAnchors.map((anchor) => this.distanceMeters(lat as number, lng as number, anchor.latitude, anchor.longitude)))
      : Number.POSITIVE_INFINITY;

    if (fallback) return address.includes(fallback) || address.includes('izmir') || nearestAnchorMeters <= 40_000;
    if (address.includes(region)) return true;
    if (regionAnchors.length >= 3) return nearestAnchorMeters <= 40_000;
    return true;
  }

  private score(pointName: string, regionName: string | undefined, candidate: GoogleCandidate, regionAnchors: GeoAnchor[] = []) {
    const allVariants = this.nameVariants(pointName, regionName).map((x) => this.normalize(x)).filter(Boolean);
    const primaryVariants = new Set(this.primaryNameVariants(pointName, regionName).map((x) => this.normalize(x)).filter(Boolean));
    const actual = this.normalize(candidate.displayName?.text ?? ''), address = this.normalize(candidate.formattedAddress ?? '');
    const primaryScores = allVariants.filter((expected) => primaryVariants.has(expected)).map((expected) => this.nameScore(expected, actual));
    const alternateScores = allVariants.filter((expected) => !primaryVariants.has(expected)).map((expected) => Math.min(35, this.nameScore(expected, actual)));
    const nameScore = Math.max(0, ...primaryScores, ...alternateScores);
    const region = regionName ? this.normalize(regionName) : '';
    const fallback = regionName ? this.normalize(this.regionFallbacks[regionName.toLocaleUpperCase('tr-TR')] ?? '') : '';
    const exactRegionMatch = !!region && address.includes(region), fallbackMatch = !!fallback && address.includes(fallback);
    let score = nameScore;
    const anchorDistanceMeters = this.regionAnchorDistance(candidate, regionAnchors);
    if (exactRegionMatch) score += 25;
    else if (fallbackMatch) score += 20;
    else if (region) {
      if (nameScore >= 40 && anchorDistanceMeters <= 25_000) score += 25;
      else if (nameScore >= 50 && anchorDistanceMeters <= 40_000) score += 5;
      else score -= 35;
    }

    if (Number.isFinite(anchorDistanceMeters)) {
      if (anchorDistanceMeters <= 5_000) score += 20;
      else if (anchorDistanceMeters <= 15_000) score += 15;
      else if (anchorDistanceMeters <= 30_000) score += 8;
      else if (anchorDistanceMeters <= 50_000) score += 3;
      else if (anchorDistanceMeters > 120_000) score -= 35;
      else if (anchorDistanceMeters > 80_000) score -= 20;
    }
    if (address.includes('izmir')) score += 5;
    return Math.max(0, Math.min(score, 100));
  }

  private combinedScore(pointName: string, sapName: string | null | undefined, regionName: string | undefined, candidate: GoogleCandidate, regionAnchors: GeoAnchor[] = []) {
    const operationalScore = this.score(pointName, regionName, candidate, regionAnchors);
    if (!sapName?.trim()) return operationalScore;
    const sapEvidence = this.nameEvidence(sapName, regionName, candidate);
    if (operationalScore < 45) return operationalScore;
    const sapBonus = sapEvidence >= 60 ? 20 : sapEvidence >= 50 ? 15 : sapEvidence >= 45 ? 8 : 0;
    return Math.min(100, operationalScore + sapBonus);
  }

  private nameEvidence(name: string, regionName: string | undefined, candidate: GoogleCandidate) {
    const actual = this.normalize(candidate.displayName?.text ?? '');
    return Math.max(0, ...this.nameVariants(name, regionName).map((variant) => this.nameScore(this.normalize(variant), actual)));
  }

  private hasExactExpectedName(pointName: string, regionName: string | undefined, candidate: GoogleCandidate) {
    const actual = this.normalize(candidate.displayName?.text ?? '');
    return this.primaryNameVariants(pointName, regionName).map((x) => this.normalize(x)).filter(Boolean).some((expected) => this.canonicalName(expected) === this.canonicalName(actual));
  }

  private identityStrength(pointName: string, sapName: string | null | undefined, regionName: string | undefined, candidate: GoogleCandidate) {
    const operationalExact = this.hasExactExpectedName(pointName, regionName, candidate);
    const sapExact = !!sapName?.trim() && this.hasExactExpectedName(sapName, regionName, candidate);
    const operationalBrand = this.hasDistinctiveBrandMatch(pointName, candidate);
    const sapBrand = !!sapName?.trim() && this.hasDistinctiveBrandMatch(sapName, candidate);
    if ((operationalExact && sapExact) || (sapExact && operationalBrand) || (operationalExact && sapBrand)) return 3;
    if (sapExact || operationalExact || (operationalBrand && sapBrand)) return 2;
    if (operationalBrand || sapBrand) return 1;
    return 0;
  }

  private hasDistinctiveBrandMatch(expectedName: string, candidate: GoogleCandidate) {
    const actualTokens = new Set(this.canonicalName(candidate.displayName?.text ?? '').split(' ').filter(Boolean));
    const generic = new Set(['social', 'house', 'studio', 'lokasyon', 'mekan', 'kantin', 'izmir', 'bostanli', 'atakent']);
    return this.canonicalName(expectedName).split(' ').filter((token) =>
      token.length >= 4 && /^[a-zçğıöşü]+$/i.test(token) && !this.businessTypeTokens.has(token) && !generic.has(token)
    ).some((token) => actualTokens.has(token));
  }

  private hasAddressQualifierMatch(pointName: string, candidate: GoogleCandidate) {
    const actualTokens = new Set(this.canonicalName(candidate.displayName?.text ?? '').split(' ').filter(Boolean));
    const addressTokens = new Set(this.normalize(candidate.formattedAddress ?? '').split(' ').filter(Boolean));
    const ignored = new Set(['lokasyon', 'seyyar', 'yeni', 'eski', 'adi', 'ismi']);
    return this.normalize(pointName).split(' ').filter((token) =>
      token.length >= 4 && !actualTokens.has(token) && !this.businessTypeTokens.has(token) && !ignored.has(token)
    ).some((token) => addressTokens.has(token));
  }

  private isSapTransitionCandidate(pointName: string, sapName: string | null | undefined, regionName: string | undefined, candidate: GoogleCandidate, other: GoogleCandidate) {
    if (!sapName?.trim() || !this.isSamePhysicalPlace(candidate, other)) return false;
    const candidateName = this.canonicalName(candidate.displayName?.text ?? '');
    const otherName = this.canonicalName(other.displayName?.text ?? '');
    if (!candidateName || !otherName || candidateName === otherName) return false;
    const sapEvidence = this.nameEvidence(sapName, regionName, candidate);
    const operationalEvidence = this.nameEvidence(pointName, regionName, other);
    return sapEvidence >= 35 && operationalEvidence >= 35;
  }

  private isSamePhysicalPlace(a: GoogleCandidate, b: GoogleCandidate) {
    const aLat = a.location?.latitude, aLng = a.location?.longitude, bLat = b.location?.latitude, bLng = b.location?.longitude;
    if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return false;
    const distance = this.distanceMeters(aLat as number, aLng as number, bLat as number, bLng as number);
    if (distance > 50) return false;
    const aAddress = this.normalize(a.formattedAddress ?? ''), bAddress = this.normalize(b.formattedAddress ?? '');
    const aTokens = new Set(aAddress.split(' ').filter((x) => x.length > 2));
    const bTokens = new Set(bAddress.split(' ').filter((x) => x.length > 2));
    const overlap = [...aTokens].filter((x) => bTokens.has(x)).length;
    return overlap >= 3;
  }

  private isColocatedHyphenAliasPair(pointName: string, a: GoogleCandidate, b: GoogleCandidate) {
    const aliases = pointName.replace(/\([^)]*\)/g, ' ').split(/\s*[-–—]\s*/).map((x) => x.trim()).filter((x) => this.normalize(x).length >= 3);
    if (aliases.length < 2 || !this.isSamePhysicalPlace(a, b)) return false;
    const aName = this.normalize(a.displayName?.text ?? ''), bName = this.normalize(b.displayName?.text ?? '');
    const aMatches = aliases.filter((alias) => this.nameScore(this.normalize(alias), aName) >= 30);
    const bMatches = aliases.filter((alias) => this.nameScore(this.normalize(alias), bName) >= 30);
    return aMatches.some((left) => bMatches.some((right) => this.normalize(left) !== this.normalize(right)));
  }

  private hasDecisiveGeography(regionName: string | undefined, best: RankedCandidate, second: RankedCandidate, bestIdentity: number) {
    if (!regionName || bestIdentity < 2 || !Number.isFinite(best.regionDistance) || !Number.isFinite(second.regionDistance)) return false;
    if (best.regionDistance > 50_000) return false;
    const gap = second.regionDistance - best.regionDistance;
    return gap >= 15_000 && second.regionDistance >= best.regionDistance * 1.5;
  }

  private regionAnchorDistance(candidate: GoogleCandidate, regionAnchors: GeoAnchor[]) {
    const lat = candidate.location?.latitude, lng = candidate.location?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || regionAnchors.length < 3) return Number.POSITIVE_INFINITY;
    const distances = regionAnchors
      .map((anchor) => this.distanceMeters(lat as number, lng as number, anchor.latitude, anchor.longitude))
      .sort((a, b) => a - b);
    const nearest = distances.slice(0, Math.min(3, distances.length));
    return nearest.reduce((sum, value) => sum + value, 0) / nearest.length;
  }

  private distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
    const r = 6371000, toRad = (value: number) => value * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private nameScore(expected: string, actual: string) {
    const canonicalExpected = this.canonicalName(expected), canonicalActual = this.canonicalName(actual);
    if (canonicalExpected === canonicalActual) return 65;
    const expectedTokens = canonicalExpected.split(' ').filter(Boolean);
    const actualTokens = canonicalActual.split(' ').filter(Boolean);
    const compactExpected = expectedTokens.join(''), compactActual = actualTokens.join('');
    const spacingChanged = expectedTokens.length !== actualTokens.length;
    if (spacingChanged && Math.min(compactExpected.length, compactActual.length) >= 6) {
      if (compactExpected === compactActual) return 65;
      if (Math.min(compactExpected.length, compactActual.length) >= 7 && this.editDistanceAtMostOne(compactExpected, compactActual)) return 55;
      if (Math.min(compactExpected.length, compactActual.length) >= 6 && this.isRepeatedFinalLetterVariant(compactExpected, compactActual)) return 55;
    }
    if (!expectedTokens.length || !actualTokens.length) return 0;
    const matchedActual = new Set<number>();
    let overlap = 0;
    for (const expectedToken of expectedTokens) {
      const index = actualTokens.findIndex((actualToken, i) => !matchedActual.has(i) && this.tokensEquivalent(expectedToken, actualToken));
      if (index >= 0) { overlap += 1; matchedActual.add(index); }
    }
    const recall = overlap / expectedTokens.length;
    const precision = overlap / actualTokens.length;
    if (!recall || !precision) return 0;
    const f1 = 2 * precision * recall / (precision + recall);
    return Math.min(60, Math.round(f1 * 60));
  }

  private tokensEquivalent(a: string, b: string) {
    if (a === b) return true;
    if ((`${a}s` === b || `${b}s` === a) && Math.min(a.length, b.length) >= 3) return true;
    if (Math.min(a.length, b.length) >= 4 && Math.abs(a.length - b.length) <= 1) return this.editDistanceAtMostOne(a, b);
    return false;
  }

  private isRepeatedFinalLetterVariant(a: string, b: string) {
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (longer.length !== shorter.length + 1 || !shorter.length) return false;
    return longer.slice(0, -1) === shorter && longer[longer.length - 1] === shorter[shorter.length - 1];
  }

  private editDistanceAtMostOne(a: string, b: string) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i += 1; j += 1; continue; }
      edits += 1;
      if (edits > 1) return false;
      if (a.length > b.length) i += 1;
      else if (b.length > a.length) j += 1;
      else { i += 1; j += 1; }
    }
    if (i < a.length || j < b.length) edits += 1;
    return edits <= 1;
  }

  private canonicalName(value: string) {
    const tokens = this.normalize(value).split(' ').filter(Boolean).map((token) => {
      if (token === 'rest' || token === 'restaurant' || token === 'restoran') return 'restaurant';
      if (token === 'kafe') return 'cafe';
      if (token === 'hotel') return 'otel';
      if (token === 'kulubu' || token === 'kulup') return 'club';
      return token;
    });
    while (tokens.length > 1 && this.businessTypeTokens.has(tokens[tokens.length - 1])) tokens.pop();
    return tokens.join(' ');
  }

  private normalize(value: string) {
    return value.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/([0-9])\s*[:.]\s*([0-9])/g, '$1$2').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim();
  }
}
