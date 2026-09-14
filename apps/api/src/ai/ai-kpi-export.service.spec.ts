import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AiKpiExportService } from './ai-kpi-export.service';

const service = new AiKpiExportService();

test('builds excel-friendly semicolon csv with core AI KPI sections', () => {
  const report = service.build({
    generatedAt:'2026-09-14T17:00:00.000Z', engineVersion:'v1', featureSchemaVersion:'s1', currentWeek:'2026-W37',
    maturity:{overallScore:81,overallState:'ACTIVE'}, dataQuality:{score:92,confidence:'HIGH'},
    backtest:{accuracy:0.8,evaluatedPredictions:10},
    technicians:[{id:'t1',name:'Tech',risk:{severity:'MEDIUM',confidence:'HIGH'},workload:{standardCurrent:2,smartcleanCurrent:1,standardCarryover:1,smartcleanCarryover:0}}],
    regionHealth:[{regionId:'r1',score:76,state:'AMBER',trend:'STABLE',confidence:'MEDIUM'}],
    planning:{recommendations:[{type:'REVIEW_ROUTE',priority:99,technicianId:'t1',severity:'MEDIUM',confidence:'HIGH',reasonCodes:['TRAVEL_PRESSURE_HIGH']}]},
    calibration:{equipment:[],travel:[]}, outputDrift:{state:'STABLE',maxAbsoluteDelta:0.03}, telemetry:{operations:[]},
  });
  assert.equal(report.contentType, 'text/csv; charset=utf-8');
  assert.equal(report.filename, 'ai-kpi-2026-09-14.csv');
  assert.ok(report.content.startsWith('\ufeffSECTION;KEY;VALUE;DETAIL'));
  assert.match(report.content, /MATURITY;overallScore;81;ACTIVE/);
  assert.match(report.content, /TECHNICIAN;Tech;MEDIUM/);
  assert.match(report.content, /REGION;r1;76/);
  assert.match(report.content, /RECOMMENDATION;REVIEW_ROUTE;99/);
  assert.match(report.content, /OUTPUT_DRIFT;state;STABLE/);
});

test('escapes semicolon and quote characters safely', () => {
  const report = service.build({
    generatedAt:'2026-09-14T17:00:00.000Z', engineVersion:'v1;"quoted"', featureSchemaVersion:'s1', currentWeek:'2026-W37',
    maturity:{overallScore:0,overallState:'INACTIVE'}, dataQuality:{score:0,confidence:'LOW'},
    backtest:{accuracy:null,evaluatedPredictions:0}, technicians:[], regionHealth:[], planning:{recommendations:[]},
    calibration:{equipment:[],travel:[]}, outputDrift:{state:'UNKNOWN',maxAbsoluteDelta:null}, telemetry:{operations:[]},
  });
  assert.match(report.content, /"v1;""quoted"""/);
});
