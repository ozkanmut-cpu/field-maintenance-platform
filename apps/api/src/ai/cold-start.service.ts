import { Injectable } from '@nestjs/common';
import { FeatureRecord, FeatureSnapshot } from './feature-store.types';
import { ColdStartEstimate, ColdStartHistory, ColdStartSource } from './cold-start.types';

@Injectable()
export class ColdStartService {
  estimatePoint(history: ColdStartHistory, pointId: string, metric: string): ColdStartEstimate {
    const own = this.entitySamples(history, 'POINT', pointId, metric);
    if (own.length >= 3) return this.result('POINT', pointId, metric, own, 'ENTITY_HISTORY', 1, 'Noktanın kendi geçmişi yeterli');

    const latest = this.latestRecord(history, 'POINT', pointId);
    const regionId = this.string(latest?.features.regionId);
    const maintenanceType = this.string(latest?.features.maintenanceType);

    if (regionId && maintenanceType) {
      const cohort = this.pointCohort(history, pointId, metric, (r) =>
        this.string(r.features.regionId) === regionId && this.string(r.features.maintenanceType) === maintenanceType,
      );
      if (cohort.samples.length >= 4 && cohort.entities >= 2) {
        return this.result('POINT', pointId, metric, cohort.samples, 'REGION_TYPE_COHORT', cohort.entities, 'Aynı bölge ve bakım tipindeki noktalardan tahmin');
      }
    }

    if (maintenanceType) {
      const cohort = this.pointCohort(history, pointId, metric, (r) => this.string(r.features.maintenanceType) === maintenanceType);
      if (cohort.samples.length >= 6 && cohort.entities >= 3) {
        return this.result('POINT', pointId, metric, cohort.samples, 'TYPE_COHORT', cohort.entities, 'Aynı bakım tipindeki şirket noktalarından tahmin');
      }
    }

    const company = this.pointCohort(history, pointId, metric, () => true);
    if (company.samples.length >= 6 && company.entities >= 3) {
      return this.result('POINT', pointId, metric, company.samples, 'COMPANY_COHORT', company.entities, 'Şirket geneli nokta geçmişinden düşük güvenli tahmin');
    }
    return this.insufficient('POINT', pointId, metric, own.length);
  }

  estimateTechnician(history: ColdStartHistory, technicianId: string, metric: string): ColdStartEstimate {
    const own = this.entitySamples(history, 'TECHNICIAN', technicianId, metric);
    if (own.length >= 3) return this.result('TECHNICIAN', technicianId, metric, own, 'ENTITY_HISTORY', 1, 'Teknisyenin kendi geçmişi yeterli');

    const latest = this.latestSnapshot(history);
    const target = latest?.records.find((r) => r.entityType === 'TECHNICIAN' && r.entityId === technicianId);
    const assignedCount = this.number(target?.features.assignedRegionCount);
    const cohort = this.genericCohort(history, 'TECHNICIAN', technicianId, metric, (record) => {
      const count = this.number(record.features.assignedRegionCount);
      return assignedCount !== null && count !== null && Math.abs(count - assignedCount) <= 1;
    });
    if (cohort.samples.length >= 6 && cohort.entities >= 2) {
      return this.result('TECHNICIAN', technicianId, metric, cohort.samples, 'SIMILAR_REGION_COHORT', cohort.entities, 'Benzer bölge sorumluluğundaki teknisyenlerden tahmin');
    }

    const company = this.genericCohort(history, 'TECHNICIAN', technicianId, metric, () => true);
    if (company.samples.length >= 6 && company.entities >= 2) {
      return this.result('TECHNICIAN', technicianId, metric, company.samples, 'COMPANY_COHORT', company.entities, 'Şirket geneli teknisyen geçmişinden düşük güvenli tahmin');
    }
    return this.insufficient('TECHNICIAN', technicianId, metric, own.length);
  }

  estimateRegion(history: ColdStartHistory, regionId: string, metric: string): ColdStartEstimate {
    const own = this.entitySamples(history, 'REGION', regionId, metric);
    if (own.length >= 3) return this.result('REGION', regionId, metric, own, 'ENTITY_HISTORY', 1, 'Bölgenin kendi geçmişi yeterli');

    const latest = this.latestRecord(history, 'REGION', regionId);
    const targetPoints = this.number(latest?.features.pointCount);
    const cohort = this.genericCohort(history, 'REGION', regionId, metric, (record) => {
      const points = this.number(record.features.pointCount);
      if (targetPoints === null || points === null) return false;
      const tolerance = Math.max(3, targetPoints * 0.5);
      return Math.abs(points - targetPoints) <= tolerance;
    });
    if (cohort.samples.length >= 6 && cohort.entities >= 2) {
      return this.result('REGION', regionId, metric, cohort.samples, 'SIMILAR_REGION_COHORT', cohort.entities, 'Benzer nokta hacmindeki bölgelerden tahmin');
    }

    const company = this.genericCohort(history, 'REGION', regionId, metric, () => true);
    if (company.samples.length >= 6 && company.entities >= 2) {
      return this.result('REGION', regionId, metric, company.samples, 'COMPANY_COHORT', company.entities, 'Şirket geneli bölge geçmişinden düşük güvenli tahmin');
    }
    return this.insufficient('REGION', regionId, metric, own.length);
  }

  private pointCohort(history: FeatureSnapshot[], targetId: string, metric: string, predicate: (record: FeatureRecord) => boolean) {
    return this.genericCohort(history, 'POINT', targetId, metric, predicate);
  }

  private genericCohort(history: FeatureSnapshot[], entityType: 'POINT' | 'TECHNICIAN' | 'REGION', targetId: string, metric: string, predicate: (record: FeatureRecord) => boolean) {
    const samples: number[] = [];
    const entities = new Set<string>();
    for (const snapshot of history) {
      for (const record of snapshot.records) {
        if (record.entityType !== entityType || record.entityId === targetId || !predicate(record)) continue;
        const value = this.number(record.features[metric]);
        if (value === null) continue;
        samples.push(value);
        entities.add(record.entityId);
      }
    }
    return { samples, entities: entities.size };
  }

  private entitySamples(history: FeatureSnapshot[], entityType: 'POINT' | 'TECHNICIAN' | 'REGION', entityId: string, metric: string) {
    const samples: number[] = [];
    for (const snapshot of history) {
      const record = snapshot.records.find((r) => r.entityType === entityType && r.entityId === entityId);
      const value = this.number(record?.features[metric]);
      if (value !== null) samples.push(value);
    }
    return samples;
  }

  private latestRecord(history: FeatureSnapshot[], entityType: 'POINT' | 'TECHNICIAN' | 'REGION', entityId: string) {
    return this.latestSnapshot(history)?.records.find((r) => r.entityType === entityType && r.entityId === entityId);
  }

  private latestSnapshot(history: FeatureSnapshot[]) {
    return [...history].sort((a, b) => b.weekKey.localeCompare(a.weekKey))[0];
  }

  private result(entityType: 'POINT' | 'TECHNICIAN' | 'REGION', entityId: string, metric: string, samples: number[], source: ColdStartSource, entityCount: number, reason: string): ColdStartEstimate {
    const weeksUsed = samples.length;
    const value = this.median(samples);
    const confidence = source === 'ENTITY_HISTORY' ? (samples.length >= 6 ? 'HIGH' : 'MEDIUM') : source === 'REGION_TYPE_COHORT' || source === 'SIMILAR_REGION_COHORT' ? 'MEDIUM' : 'LOW';
    return { entityType, entityId, metric, value, source, confidence, sampleSize: samples.length, entityCount, weeksUsed, reasons: [reason] };
  }

  private insufficient(entityType: 'POINT' | 'TECHNICIAN' | 'REGION', entityId: string, metric: string, sampleSize: number): ColdStartEstimate {
    return { entityType, entityId, metric, value: null, source: 'INSUFFICIENT', confidence: 'UNKNOWN', sampleSize, entityCount: 0, weeksUsed: sampleSize, reasons: ['Güvenilir kişisel veya cohort geçmişi henüz yok'] };
  }

  private median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private number(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private string(value: unknown) {
    return typeof value === 'string' && value.length ? value : null;
  }
}
