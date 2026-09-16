import { Injectable } from '@nestjs/common';

export type AiKpiExport = {
  filename: string;
  contentType: 'text/csv; charset=utf-8';
  content: string;
};

@Injectable()
export class AiKpiExportService {
  build(dashboard: any): AiKpiExport {
    const rows: Array<Array<string | number | null | undefined>> = [];
    rows.push(['SECTION', 'KEY', 'VALUE', 'DETAIL']);
    this.row(rows, 'META', 'generatedAt', dashboard.generatedAt, dashboard.engineVersion);
    this.row(rows, 'META', 'featureSchemaVersion', dashboard.featureSchemaVersion, dashboard.currentWeek);
    this.row(rows, 'MATURITY', 'overallScore', dashboard.maturity?.overallScore, dashboard.maturity?.overallState);
    this.row(rows, 'DATA_QUALITY', 'score', dashboard.dataQuality?.score, dashboard.dataQuality?.confidence);
    this.row(rows, 'BACKTEST', 'accuracy', dashboard.backtest?.accuracy, `evaluated=${dashboard.backtest?.evaluatedPredictions ?? 0}`);

    for (const item of dashboard.technicians ?? []) {
      const current = (item.workload?.standardCurrent ?? 0) + (item.workload?.smartcleanCurrent ?? 0);
      const carryover = (item.workload?.standardCarryover ?? 0) + (item.workload?.smartcleanCarryover ?? 0);
      this.row(rows, 'TECHNICIAN', item.name ?? item.id, item.risk?.severity, `current=${current};carryover=${carryover};confidence=${item.risk?.confidence ?? 'UNKNOWN'}`);
    }
    for (const item of dashboard.regionHealth ?? []) {
      this.row(rows, 'REGION', item.regionId, item.score, `state=${item.state};trend=${item.trend};confidence=${item.confidence}`);
    }
    for (const item of dashboard.planning?.recommendations ?? []) {
      this.row(rows, 'RECOMMENDATION', item.type, item.priority, `technician=${item.technicianId};severity=${item.severity};confidence=${item.confidence};reasons=${(item.reasonCodes ?? []).join('|')}`);
    }
    for (const item of dashboard.calibration?.equipment ?? []) {
      this.row(rows, 'CALIBRATION_EQUIPMENT', item.code, item.relativeImpact, `evidence=${item.evidence};confidence=${item.confidence}`);
    }
    for (const item of dashboard.calibration?.travel ?? []) {
      this.row(rows, 'CALIBRATION_TRAVEL', item.code, item.relativeImpact, `evidence=${item.evidence};confidence=${item.confidence}`);
    }
    this.row(rows, 'OUTPUT_DRIFT', 'state', dashboard.outputDrift?.state, `maxDelta=${dashboard.outputDrift?.maxAbsoluteDelta ?? ''}`);
    for (const item of dashboard.telemetry?.operations ?? []) {
      this.row(rows, 'TELEMETRY', item.operation, item.averageDurationMs, `p95=${item.p95DurationMs};errors=${item.errorCount};errorRate=${item.errorRate}`);
    }

    const content = '\ufeff' + rows.map((row) => row.map((value) => this.csv(value)).join(';')).join('\r\n') + '\r\n';
    const date = String(dashboard.generatedAt ?? new Date().toISOString()).slice(0, 10);
    return { filename: `ai-kpi-${date}.csv`, contentType: 'text/csv; charset=utf-8', content };
  }

  private row(rows: Array<Array<string | number | null | undefined>>, section: string, key: string, value: unknown, detail: unknown) {
    rows.push([section, key, this.scalar(value), this.scalar(detail)]);
  }
  private scalar(value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return JSON.stringify(value);
  }

  private csv(value: unknown) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
}
