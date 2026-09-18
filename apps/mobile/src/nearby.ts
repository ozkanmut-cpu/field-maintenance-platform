import { jsonRequest, type NearbyPoint, type NearbyPointsResult } from './api';

export type { NearbyPoint, NearbyPointsResult } from './api';

type NearbyRequest = <T>(path: string) => Promise<T>;

export function nearbyPoints(
  input: { latitude: number; longitude: number; radiusMeters?: number; limit?: number },
  request: NearbyRequest = jsonRequest,
): Promise<NearbyPointsResult> {
  const params = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    radiusMeters: String(input.radiusMeters ?? 10000),
    limit: String(input.limit ?? 100),
  });
  return request<NearbyPointsResult>(`/points/nearby?${params.toString()}`);
}

export function sortNearbyItems(items: NearbyPoint[]): NearbyPoint[] {
  return items.slice().sort((a, b) => (
    a.distanceMeters - b.distanceMeters
    || a.name.localeCompare(b.name, 'tr')
    || a.code.localeCompare(b.code, 'tr')
    || a.id.localeCompare(b.id)
  ));
}
