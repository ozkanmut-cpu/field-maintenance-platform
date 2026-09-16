import { Injectable } from '@nestjs/common';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';

type RuntimeBucket = {
  count: number;
  errorCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
  samples: number[];
};

export type AiRuntimeMetric = {
  operation: string;
  count: number;
  errorCount: number;
  errorRate: number;
  averageDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
};

@Injectable()
export class AiTelemetryService {
  private readonly buckets = new Map<string, RuntimeBucket>();

  async measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const started = process.hrtime.bigint();
    try {
      const result = await fn();
      this.record(operation, started, false);
      return result;
    } catch (error) {
      this.record(operation, started, true);
      throw error;
    }
  }

  snapshot() {
    return {
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      operations: [...this.buckets.entries()]
        .map(([operation, bucket]) => this.metric(operation, bucket))
        .sort((a, b) => a.operation.localeCompare(b.operation)),
    };
  }

  private record(operation: string, started: bigint, failed: boolean) {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const bucket = this.buckets.get(operation) ?? {
      count: 0, errorCount: 0, totalDurationMs: 0, maxDurationMs: 0, lastDurationMs: 0, samples: [],
    };
    bucket.count += 1;
    if (failed) bucket.errorCount += 1;
    bucket.totalDurationMs += durationMs;
    bucket.maxDurationMs = Math.max(bucket.maxDurationMs, durationMs);
    bucket.lastDurationMs = durationMs;
    bucket.samples.push(durationMs);
    if (bucket.samples.length > 100) bucket.samples.splice(0, bucket.samples.length - 100);
    this.buckets.set(operation, bucket);
  }

  private metric(operation: string, bucket: RuntimeBucket): AiRuntimeMetric {
    const sorted = [...bucket.samples].sort((a, b) => a - b);
    const p95Index = sorted.length ? Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1) : 0;
    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      operation,
      count: bucket.count,
      errorCount: bucket.errorCount,
      errorRate: bucket.count ? Math.round((bucket.errorCount / bucket.count) * 1000) / 1000 : 0,
      averageDurationMs: round(bucket.count ? bucket.totalDurationMs / bucket.count : 0),
      p95DurationMs: round(sorted.length ? sorted[p95Index] : 0),
      maxDurationMs: round(bucket.maxDurationMs),
      lastDurationMs: round(bucket.lastDurationMs),
    };
  }
}
