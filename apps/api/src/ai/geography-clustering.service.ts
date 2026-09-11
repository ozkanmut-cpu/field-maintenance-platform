import { Injectable } from '@nestjs/common';
import { GeoPoint, GeographyService } from './geography.service';

export type ClusterablePoint = GeoPoint & { id: string };
export type GeoCluster = {
  id: string;
  pointIds: string[];
  size: number;
  centerLatitude: number;
  centerLongitude: number;
  p90RadiusMeters: number;
};
export type GeoClusteringResult = {
  pointCount: number;
  clusterCount: number;
  clusteredPointCount: number;
  isolatedPointCount: number;
  largestClusterSize: number;
  largestClusterShare: number;
  fragmentationRatio: number;
  adaptiveLinkMeters: number | null;
  nearestNeighborP50Meters: number | null;
  nearestNeighborP75Meters: number | null;
  nearestNeighborP90Meters: number | null;
  clusters: GeoCluster[];
  isolatedPointIds: string[];
};

@Injectable()
export class GeographyClusteringService {
  constructor(private readonly geography: GeographyService) {}

  clusterAdaptive(points: ClusterablePoint[]): GeoClusteringResult {
    const ordered = [...points].sort((a, b) => a.id.localeCompare(b.id));
    if (!ordered.length) return this.empty();
    if (ordered.length === 1) return this.single(ordered[0].id);

    const nearest = ordered.map((point, i) => Math.min(...ordered
      .filter((_, j) => j !== i)
      .map((other) => this.geography.distanceMeters(point, other))));
    const sortedNearest = [...nearest].sort((a, b) => a - b);
    const p50 = this.percentile(sortedNearest, 0.5);
    const p75 = this.percentile(sortedNearest, 0.75);
    const p90 = this.percentile(sortedNearest, 0.9);
    const linkMeters = Math.max(p75, 1);

    return this.clusterWithRadius(ordered, linkMeters, { p50, p75, p90 });
  }

  clusterWithRadius(points: ClusterablePoint[], linkMeters: number, nearest?: { p50: number; p75: number; p90: number }): GeoClusteringResult {
    if (!Number.isFinite(linkMeters) || linkMeters <= 0) throw new Error('linkMeters must be positive');
    const ordered = [...points].sort((a, b) => a.id.localeCompare(b.id));
    const unvisited = new Set(ordered.map((p) => p.id));
    const byId = new Map(ordered.map((p) => [p.id, p]));
    const groups: ClusterablePoint[][] = [];

    for (const seed of ordered) {
      if (!unvisited.has(seed.id)) continue;
      const group: ClusterablePoint[] = [];
      const queue = [seed.id];
      unvisited.delete(seed.id);
      while (queue.length) {
        const id = queue.shift()!;
        const current = byId.get(id)!;
        group.push(current);
        for (const candidate of ordered) {
          if (!unvisited.has(candidate.id)) continue;
          if (this.geography.distanceMeters(current, candidate) <= linkMeters) {
            unvisited.delete(candidate.id);
            queue.push(candidate.id);
          }
        }
      }
      groups.push(group);
    }

    const clusteredGroups = groups.filter((g) => g.length >= 2);
    const isolated = groups.filter((g) => g.length === 1).flat();
    const clusters = clusteredGroups.map((group, index) => {
      const summary = this.geography.summarize(group);
      return {
        id: `C${String(index + 1).padStart(3, '0')}`,
        pointIds: group.map((p) => p.id).sort(),
        size: group.length,
        centerLatitude: summary.centerLatitude!,
        centerLongitude: summary.centerLongitude!,
        p90RadiusMeters: summary.p90RadiusMeters!,
      };
    }).sort((a, b) => b.size - a.size || a.pointIds[0].localeCompare(b.pointIds[0]));

    const largest = clusters[0]?.size ?? 0;
    const clusteredPointCount = clusters.reduce((sum, c) => sum + c.size, 0);
    return {
      pointCount: ordered.length,
      clusterCount: clusters.length,
      clusteredPointCount,
      isolatedPointCount: isolated.length,
      largestClusterSize: largest,
      largestClusterShare: ordered.length ? largest / ordered.length : 0,
      fragmentationRatio: ordered.length ? (clusters.length + isolated.length) / ordered.length : 0,
      adaptiveLinkMeters: linkMeters,
      nearestNeighborP50Meters: nearest?.p50 ?? null,
      nearestNeighborP75Meters: nearest?.p75 ?? null,
      nearestNeighborP90Meters: nearest?.p90 ?? null,
      clusters,
      isolatedPointIds: isolated.map((p) => p.id).sort(),
    };
  }

  private percentile(sorted: number[], p: number) {
    const index = (sorted.length - 1) * p;
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  }

  private empty(): GeoClusteringResult {
    return { pointCount: 0, clusterCount: 0, clusteredPointCount: 0, isolatedPointCount: 0, largestClusterSize: 0, largestClusterShare: 0, fragmentationRatio: 0, adaptiveLinkMeters: null, nearestNeighborP50Meters: null, nearestNeighborP75Meters: null, nearestNeighborP90Meters: null, clusters: [], isolatedPointIds: [] };
  }
  private single(id: string): GeoClusteringResult {
    return { ...this.empty(), pointCount: 1, isolatedPointCount: 1, fragmentationRatio: 1, isolatedPointIds: [id] };
  }
}
