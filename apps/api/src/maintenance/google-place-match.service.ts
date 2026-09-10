import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationSource, Prisma, VisitStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  businessStatus?: string;
  location?: { latitude?: number; longitude?: number };
};

type GooglePlacesResponse = { places?: GooglePlace[] };

type Candidate = {
  place: GooglePlace;
  name: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  nameScore: number;
  proximityScore: number;
  totalScore: number;
};

@Injectable()
export class GooglePlaceMatchService {
  private readonly logger = new Logger(GooglePlaceMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async matchPoint(pointId: string) {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY')?.trim();
    if (!apiKey) return { pointId, matched: false, reason: 'GOOGLE_PLACES_DISABLED' };

    const point = await this.prisma.point.findFirst({
      where: { id: pointId, deletedAt: null },
      select: {
        id: true,
        name: true,
        address: true,
        locationSource: true,
        canonicalLatitude: true,
        canonicalLongitude: true,
        googlePlaceId: true,
      },
    });
    if (!point) return { pointId, matched: false, reason: 'POINT_NOT_FOUND' };
    if (point.locationSource === LocationSource.MANUAL) {
      return { pointId, matched: false, reason: 'MANUAL_LOCATION_PROTECTED' };
    }
    if (point.locationSource === LocationSource.GOOGLE_MATCH && point.googlePlaceId) {
      return { pointId, matched: false, reason: 'ALREADY_GOOGLE_MATCHED' };
    }

    const evidence = await this.bestSearchCenter(pointId, point.canonicalLatitude, point.canonicalLongitude);
    if (!evidence) return { pointId, matched: false, reason: 'NO_ELIGIBLE_LOCATION_EVIDENCE' };

    const radiusMeters = this.numberConfig('GOOGLE_PLACES_RADIUS_METERS', 250);
    const minNameScore = this.numberConfig('GOOGLE_PLACES_MIN_NAME_SCORE', 0.72);
    const minTotalScore = this.numberConfig('GOOGLE_PLACES_MIN_TOTAL_SCORE', 0.82);
    const minMargin = this.numberConfig('GOOGLE_PLACES_MIN_MARGIN', 0.08);

    const places = await this.searchNearby(apiKey, evidence.latitude, evidence.longitude, radiusMeters);
    const candidates = places
      .map((place) => this.scoreCandidate(point.name, place, evidence.latitude, evidence.longitude, radiusMeters))
      .filter((candidate): candidate is Candidate => candidate !== null)
      .sort((a, b) => b.totalScore - a.totalScore);

    const best = candidates[0];
    const second = candidates[1];
    if (!best) return { pointId, matched: false, reason: 'NO_GOOGLE_CANDIDATE' };

    const margin = second ? best.totalScore - second.totalScore : 1;
    if (
      best.nameScore < minNameScore ||
      best.totalScore < minTotalScore ||
      margin < minMargin
    ) {
      return {
        pointId,
        matched: false,
        reason: 'AMBIGUOUS_OR_WEAK_MATCH',
        best: this.presentCandidate(best),
        second: second ? this.presentCandidate(second) : null,
        thresholds: { minNameScore, minTotalScore, minMargin, radiusMeters },
      };
    }

    const placeId = best.place.id;
    if (!placeId) return { pointId, matched: false, reason: 'GOOGLE_PLACE_ID_MISSING' };

    const updated = await this.prisma.point.update({
      where: { id: pointId },
      data: {
        canonicalLatitude: new Prisma.Decimal(best.latitude.toFixed(6)),
        canonicalLongitude: new Prisma.Decimal(best.longitude.toFixed(6)),
        locationSource: LocationSource.GOOGLE_MATCH,
        locationConfidence: Math.max(90, Math.min(100, Math.round(best.totalScore * 100))),
        googlePlaceId: placeId,
        googleBusinessName: best.name,
      },
      select: {
        id: true,
        name: true,
        canonicalLatitude: true,
        canonicalLongitude: true,
        locationSource: true,
        locationConfidence: true,
        googlePlaceId: true,
        googleBusinessName: true,
      },
    });

    return {
      pointId,
      matched: true,
      match: this.presentCandidate(best),
      margin,
      point: updated,
    };
  }

  async matchEligiblePoints(limit = 50) {
    const points = await this.prisma.point.findMany({
      where: {
        deletedAt: null,
        locationSource: { in: [LocationSource.UNKNOWN, LocationSource.FIELD_CONFIRMED] },
      },
      select: { id: true },
      take: Math.min(Math.max(limit, 1), 250),
    });

    const results = [];
    for (const point of points) {
      try {
        results.push(await this.matchPoint(point.id));
      } catch (error) {
        this.logger.warn(
          `Google Places match failed for point ${point.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        results.push({ pointId: point.id, matched: false, reason: 'GOOGLE_REQUEST_FAILED' });
      }
    }
    return { scannedPoints: points.length, results };
  }

  private async bestSearchCenter(
    pointId: string,
    canonicalLatitude: Prisma.Decimal | null,
    canonicalLongitude: Prisma.Decimal | null,
  ) {
    if (canonicalLatitude !== null && canonicalLongitude !== null) {
      return {
        latitude: Number(canonicalLatitude),
        longitude: Number(canonicalLongitude),
        source: 'CANONICAL' as const,
      };
    }

    const visit = await this.prisma.maintenanceVisit.findFirst({
      where: {
        pointId,
        status: VisitStatus.VALID,
        enteredLate: false,
        suspiciousBatch: false,
        locationLearningEligible: true,
      },
      orderBy: { performedAt: 'desc' },
      select: { latitude: true, longitude: true },
    });
    if (!visit) return null;
    return {
      latitude: Number(visit.latitude),
      longitude: Number(visit.longitude),
      source: 'VISIT' as const,
    };
  }

  private async searchNearby(apiKey: string, latitude: number, longitude: number, radiusMeters: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
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
          maxResultCount: 20,
          languageCode: 'tr',
          regionCode: 'TR',
          locationRestriction: {
            circle: {
              center: { latitude, longitude },
              radius: radiusMeters,
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Google Places ${response.status}: ${body.slice(0, 300)}`);
      }
      const data = (await response.json()) as GooglePlacesResponse;
      return data.places ?? [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private scoreCandidate(
    pointName: string,
    place: GooglePlace,
    centerLat: number,
    centerLng: number,
    radiusMeters: number,
  ): Candidate | null {
    const name = place.displayName?.text?.trim();
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    if (!name || latitude === undefined || longitude === undefined) return null;
    if (place.businessStatus === 'CLOSED_PERMANENTLY') return null;

    const nameScore = this.nameSimilarity(pointName, name);
    const distanceMeters = this.distanceMeters(centerLat, centerLng, latitude, longitude);
    const proximityScore = Math.max(0, 1 - distanceMeters / Math.max(radiusMeters, 1));
    const totalScore = nameScore * 0.8 + proximityScore * 0.2;
    return {
      place,
      name,
      latitude,
      longitude,
      distanceMeters,
      nameScore,
      proximityScore,
      totalScore,
    };
  }

  private presentCandidate(candidate: Candidate) {
    return {
      placeId: candidate.place.id ?? null,
      name: candidate.name,
      address: candidate.place.formattedAddress ?? null,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      distanceMeters: Math.round(candidate.distanceMeters),
      nameScore: Number(candidate.nameScore.toFixed(3)),
      totalScore: Number(candidate.totalScore.toFixed(3)),
    };
  }

  private nameSimilarity(a: string, b: string) {
    const left = this.normalizeName(a);
    const right = this.normalizeName(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.92;

    const leftTokens = new Set(left.split(' ').filter(Boolean));
    const rightTokens = new Set(right.split(' ').filter(Boolean));
    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    const tokenScore = union ? intersection / union : 0;

    const leftBigrams = this.ngrams(left.replace(/ /g, ''), 2);
    const rightBigrams = this.ngrams(right.replace(/ /g, ''), 2);
    const common = [...leftBigrams].filter((gram) => rightBigrams.has(gram)).length;
    const bigramUnion = new Set([...leftBigrams, ...rightBigrams]).size;
    const bigramScore = bigramUnion ? common / bigramUnion : 0;

    return Math.max(tokenScore, tokenScore * 0.55 + bigramScore * 0.45);
  }

  private normalizeName(value: string) {
    return value
      .toLocaleLowerCase('tr-TR')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9çğıöşü\s]/gi, ' ')
      .replace(/\b(ltd|sti|şirketi|restaurant|restoran|cafe|kafe|bar|otel|hotel)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private ngrams(value: string, size: number) {
    const grams = new Set<string>();
    if (value.length <= size) {
      if (value) grams.add(value);
      return grams;
    }
    for (let index = 0; index <= value.length - size; index += 1) {
      grams.add(value.slice(index, index + size));
    }
    return grams;
  }

  private distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const p1 = lat1 * (Math.PI / 180);
    const p2 = lat2 * (Math.PI / 180);
    const deltaLat = p2 - p1;
    const deltaLon = (lon2 - lon1) * (Math.PI / 180);
    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(p1) * Math.cos(p2) * Math.sin(deltaLon / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  private numberConfig(name: string, fallback: number) {
    const raw = this.config.get<string>(name);
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
