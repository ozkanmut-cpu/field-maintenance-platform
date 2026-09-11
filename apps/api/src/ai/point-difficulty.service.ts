import { Injectable } from '@nestjs/common';
import { FeatureSnapshot } from './feature-store.types';
import { PointDifficultyProfile } from './point-difficulty.types';

@Injectable()
export class PointDifficultyService {
  assess(history: FeatureSnapshot[]): PointDifficultyProfile[] {
    const ordered = [...history].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    const ids = new Set(ordered.flatMap((s) => s.records.filter((r) => r.entityType === 'POINT').map((r) => r.entityId)));
    return [...ids].sort().map((id) => this.assessPoint(ordered, id));
  }

  assessPoint(history: FeatureSnapshot[], pointId: string): PointDifficultyProfile {
    const rows = history.flatMap((s) => s.records.filter((r) => r.entityType === 'POINT' && r.entityId === pointId));
    const latest = rows.at(-1)?.features ?? {};
    const numberOrNull = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const equipment = {
      coolerCount: numberOrNull(latest.coolerCount),
      towerCount: numberOrNull(latest.towerCount),
      tapCount: numberOrNull(latest.tapCount),
      smarttapCount: numberOrNull(latest.smarttapCount),
    };
    const equipmentProfileComplete = Object.values(equipment).every((v) => v !== null);
    const visits = rows.reduce((s, r) => s + Number(r.features.visitCount ?? 0), 0);
    const attempts = rows.reduce((s, r) => s + Number(r.features.attemptCount ?? 0), 0);
    const missed = rows.reduce((s, r) => s + Number(r.features.missedObligationCount ?? 0), 0);
    const completed = rows.reduce((s, r) => s + Number(r.features.completedObligationCount ?? 0), 0);
    const observedPeriods = missed + completed;
    const reasons: string[] = [];
    if (!equipmentProfileComplete) reasons.push('EQUIPMENT_PROFILE_INCOMPLETE');
    if (latest.hasCanonicalLocation !== true) reasons.push('LOCATION_MISSING');
    if (history.length < 4) reasons.push('HISTORY_TOO_SHORT');
    if (visits + attempts < 4 && observedPeriods < 4) reasons.push('OUTCOME_EVIDENCE_LOW');
    const active = equipmentProfileComplete && history.length >= 4 && (visits + attempts >= 4 || observedPeriods >= 4);
    const adverse = attempts + missed;
    const favorable = visits + completed;
    const total = adverse + favorable;
    const score = active && total > 0 ? Math.round((adverse / total) * 1000) / 10 : null;
    const confidence = !active ? 'LOW' : history.length >= 12 && total >= 12 ? 'HIGH' : total >= 6 ? 'MEDIUM' : 'LOW';
    return {
      pointId,
      state: active ? 'ACTIVE' : 'WARMING_UP',
      confidence,
      score,
      equipmentProfileComplete,
      equipment,
      geography: {
        located: latest.hasCanonicalLocation === true,
        isolated: latest.geographicIsolated === true,
        nearestNeighborMeters: numberOrNull(latest.nearestNeighborMeters),
      },
      history: { visits, attempts, missed, completed, observedPeriods },
      reasons,
    };
  }
}
