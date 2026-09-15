import { Injectable } from '@nestjs/common';
import { FeatureSnapshot } from './feature-store.types';
import { GeographyService } from './geography.service';

export type IdentityCandidate = {
  leftPointId: string;
  rightPointId: string;
  confidence: number;
  reasons: string[];
  nameSimilarity: number;
  addressSimilarity: number | null;
  distanceMeters: number | null;
  sameGooglePlace: boolean;
  historySupported: boolean;
};

@Injectable()
export class IdentityConfidenceService {
  constructor(private readonly geography: GeographyService) {}

  assess(history: FeatureSnapshot[]): IdentityCandidate[] {
    const latest = [...history].sort((a, b) => a.weekKey.localeCompare(b.weekKey)).at(-1);
    if (!latest) return [];
    const rows = latest.records.filter((r) => r.entityType === 'POINT');
    const prepared = rows.map((row) => ({ row, names: this.names(row.features).map((name) => this.prepareName(name)) }));
    const result: IdentityCandidate[] = [];
    for (let i = 0; i < prepared.length; i += 1) for (let j = i + 1; j < prepared.length; j += 1) {
      const left = prepared[i].row, right = prepared[j].row;
      const namesLeft = prepared[i].names;
      const namesRight = prepared[j].names;
      const nameSimilarity = this.maxPreparedSimilarity(namesLeft, namesRight);
      const leftPlace = this.str(left.features.googlePlaceId);
      const rightPlace = this.str(right.features.googlePlaceId);
      const sameGooglePlace = Boolean(leftPlace && rightPlace && leftPlace === rightPlace);
      const distanceMeters = this.distance(left.features, right.features);
      const leftAddress = this.str(left.features.pointAddress);
      const rightAddress = this.str(right.features.pointAddress);
      const addressSimilarity = leftAddress && rightAddress ? this.similarity(leftAddress, rightAddress) : null;
      const likelyByName = nameSimilarity >= 0.92;
      const likelyByLocation = distanceMeters !== null && distanceMeters <= 120 && nameSimilarity >= 0.55;
      const likelyByAddress = addressSimilarity !== null && addressSimilarity >= 0.88 && nameSimilarity >= 0.65;
      if (!sameGooglePlace && !likelyByName && !likelyByLocation && !likelyByAddress) continue;
      const evidenceDepth = Math.min(this.num(left.features.locationEvidenceVisitCount), this.num(right.features.locationEvidenceVisitCount));
      const historySupported = evidenceDepth >= 2 && distanceMeters !== null && distanceMeters <= 120;
      let score = nameSimilarity * 0.65;
      if (sameGooglePlace) score += 0.5;
      if (distanceMeters !== null) score += Math.max(0, 0.25 * (1 - distanceMeters / 500));
      if (addressSimilarity !== null) score += addressSimilarity * 0.1;
      if (historySupported) score += 0.05;
      score = Math.min(1, score);
      const reasons: string[] = [];
      if (sameGooglePlace) reasons.push('SAME_GOOGLE_PLACE_ID');
      if (likelyByName) reasons.push('VERY_SIMILAR_NAME');
      if (likelyByLocation) reasons.push('NEAR_LOCATION_AND_SIMILAR_NAME');
      if (likelyByAddress) reasons.push('SIMILAR_ADDRESS');
      if (historySupported) reasons.push('VISIT_HISTORY_SUPPORTS_COLOCATION');
      result.push({
        leftPointId: left.entityId,
        rightPointId: right.entityId,
        confidence: Number(score.toFixed(3)),
        reasons,
        nameSimilarity: Number(nameSimilarity.toFixed(3)),
        addressSimilarity: addressSimilarity === null ? null : Number(addressSimilarity.toFixed(3)),
        distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters),
        sameGooglePlace,
        historySupported,
      });
    }
    return result.sort((a, b) => b.confidence - a.confidence || a.leftPointId.localeCompare(b.leftPointId) || a.rightPointId.localeCompare(b.rightPointId));
  }
  private names(f: Record<string, unknown>) {
    const values = [this.str(f.pointName), this.str(f.googleBusinessName), ...this.str(f.pointAliases).split('|')];
    return values.filter((x) => x.length > 0);
  }

  private distance(a: Record<string, unknown>, b: Record<string, unknown>) {
    const aLat = this.nulNum(a.canonicalLatitude), aLon = this.nulNum(a.canonicalLongitude);
    const bLat = this.nulNum(b.canonicalLatitude), bLon = this.nulNum(b.canonicalLongitude);
    if (aLat === null || aLon === null || bLat === null || bLon === null) return null;
    return this.geography.distanceMeters({ latitude: aLat, longitude: aLon }, { latitude: bLat, longitude: bLon });
  }

  private prepareName(value: string) {
    const normalized = this.normalize(value);
    return { normalized, pairs: this.bigrams(normalized) };
  }

  private maxPreparedSimilarity(left: Array<{ normalized: string; pairs: string[] }>, right: Array<{ normalized: string; pairs: string[] }>) {
    let best = 0;
    for (const a of left) for (const b of right) {
      const score = this.preparedSimilarity(a, b);
      if (score > best) best = score;
      if (best === 1) return 1;
    }
    return best;
  }

  private preparedSimilarity(left: { normalized: string; pairs: string[] }, right: { normalized: string; pairs: string[] }) {
    if (left.normalized === right.normalized) return left.normalized ? 1 : 0;
    if (!left.normalized || !right.normalized) return 0;
    const leftPairs = left.pairs, rightPairs = right.pairs;
    if (!leftPairs.length || !rightPairs.length) return 0;
    const counts = new Map<string, number>();
    for (const pair of leftPairs) counts.set(pair, (counts.get(pair) ?? 0) + 1);
    let overlap = 0;
    for (const pair of rightPairs) {
      const count = counts.get(pair) ?? 0;
      if (count > 0) { overlap += 1; counts.set(pair, count - 1); }
    }
    return (2 * overlap) / (leftPairs.length + rightPairs.length);
  }

  private similarity(a: string, b: string) {
    return this.preparedSimilarity(this.prepareName(a), this.prepareName(b));
  }

  private bigrams(value: string) {
    if (value.length < 2) return [value];
    const pairs: string[] = [];
    for (let index = 0; index < value.length - 1; index += 1) pairs.push(value.slice(index, index + 2));
    return pairs;
  }

  private normalize(value: string) {
    return value.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  private str(value: unknown) { return typeof value === 'string' ? value : ''; }
  private num(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
  private nulNum(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
}
