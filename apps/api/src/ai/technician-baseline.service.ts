import { Injectable } from '@nestjs/common';
import { FeatureSnapshot } from './feature-store.types';
import { BaselineBand, TechnicianWeeklyBaseline } from './technician-baseline.types';

@Injectable()
export class TechnicianBaselineService {
  assess(history: FeatureSnapshot[]): TechnicianWeeklyBaseline[] {
    const ids = new Set(history.flatMap((snapshot) => snapshot.records.filter((r) => r.entityType === 'TECHNICIAN').map((r) => r.entityId)));
    return [...ids].sort().map((id) => this.assessTechnician(history, id));
  }

  assessTechnician(history: FeatureSnapshot[], technicianId: string): TechnicianWeeklyBaseline {
    const rows = [...history]
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map((snapshot) => snapshot.records.find((r) => r.entityType === 'TECHNICIAN' && r.entityId === technicianId)?.features)
      .filter((row): row is Record<string, string | number | boolean | null> => Boolean(row));

    const serviceRows = rows.filter((row) => Number(row.completedVisitCount ?? 0) > 0 && Number(row.equipmentSnapshotCoverage ?? 0) === 1);
    const travelRows = rows.filter((row) => typeof row.fieldRouteDistanceMeters === 'number' && Number.isFinite(row.fieldRouteDistanceMeters));
    const reasons: string[] = [];
    if (serviceRows.length < 4) reasons.push('SERVICE_HISTORY_TOO_SHORT');
    if (travelRows.length < 4) reasons.push('TRAVEL_HISTORY_TOO_SHORT');

    const state = serviceRows.length >= 4 ? 'ACTIVE' : 'WARMING_UP';
    const confidence = state === 'WARMING_UP' ? 'LOW' : serviceRows.length >= 12 && travelRows.length >= 8 ? 'HIGH' : serviceRows.length >= 8 ? 'MEDIUM' : 'LOW';
    return {
      technicianId,
      state,
      confidence,
      observedWeeks: rows.length,
      serviceEvidenceWeeks: serviceRows.length,
      travelEvidenceWeeks: travelRows.length,
      service: {
        completedVisits: this.band(serviceRows, 'completedVisitCount'),
        coolerCount: this.band(serviceRows, 'servicedCoolerCount'),
        towerCount: this.band(serviceRows, 'servicedTowerCount'),
        tapCount: this.band(serviceRows, 'servicedTapCount'),
        smarttapCount: this.band(serviceRows, 'servicedSmarttapCount'),
      },
      travel: {
        routeDistanceMeters: this.band(travelRows, 'fieldRouteDistanceMeters'),
        fieldP90RadiusMeters: this.band(travelRows, 'fieldP90RadiusMeters'),
      },
      context: { uniqueVisitedPoints: this.band(serviceRows, 'uniqueVisitedPointCount') },
      reasons,
    };
  }

  private band(rows: Array<Record<string, string | number | boolean | null>>, key: string): BaselineBand {
    const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
    return { median: this.percentile(values, 0.5), p75: this.percentile(values, 0.75), p90: this.percentile(values, 0.9) };
  }

  private percentile(sorted: number[], p: number) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const lo = Math.floor(index), hi = Math.ceil(index);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
  }
}
