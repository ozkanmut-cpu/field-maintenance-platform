import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AdminAiController } from './admin-ai.controller';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';

const snapshot:any = {
  engineVersion: AI_ENGINE_VERSION, featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
  weekKey:'2026-W37', isoYear:2026, isoWeek:37, weekStart:'2026-09-07', weekEnd:'2026-09-13',
  startInstant:'2026-09-07T00:00:00.000Z', endExclusiveInstant:'2026-09-14T00:00:00.000Z',
  sourceDataThrough:null, sourceHash:'hash', generatedAt:'2026-09-14T00:00:00.000Z',
  records:[
    { entityType:'SYSTEM', entityId:'system', features:{ activePointCount:1, locatedPointCount:1, activeTechnicianCount:1, regionCount:1, equipmentProfileCompleteCount:1, equipmentProfileCoverage:1, visitCount:1, attemptCount:0 } },
    { entityType:'POINT', entityId:'p1', features:{ hasRegion:true, hasCanonicalLocation:true, coolerCount:1, towerCount:1, tapCount:1, smarttapCount:0, equipmentProfileComplete:true, visitCount:1, attemptCount:0, completedObligationCount:1, missedObligationCount:0 } },
    { entityType:'REGION', entityId:'r1', features:{ assignedTechnicianId:'t1', pointCount:1, locatedPointCount:1, equipmentKnownPointCount:1, equipmentUnknownPointCount:0, coolerCount:1, towerCount:1, tapCount:1, smarttapCount:0, standardCurrentWorkloadCount:1, standardCarryoverWorkloadCount:0, smartcleanCurrentWorkloadCount:0, smartcleanCarryoverWorkloadCount:0 } },
  ],
};
const assigned:any = {
  technicianId:'t1', standardCurrent:1, standardCarryover:0, smartcleanCurrent:0, smartcleanCarryover:0,
  equipmentKnownPointCount:1, equipmentUnknownPointCount:0, assignedCoolerCount:1, assignedTowerCount:1,
  assignedTapCount:1, assignedSmarttapCount:0, assignedLocatedPointCount:1, assignedUnlocatedPointCount:0,
  assignedFieldP90RadiusMeters:0, assignedRouteEstimateMeters:0, assignedRouteCoherenceRatio:0,
  assignedClusterCount:1, assignedIsolatedPointCount:0, assignedFragmentationRatio:0, workAreaCenterDistanceMeters:0,
  currentWeekSuspiciousVisitCount:0, currentWeekReviewRecommendedCount:0, currentWeekPaperworkPendingCount:0,
  currentWeekPaperworkCompletionP90Minutes:null,
};
const baseline:any = {
  technicianId:'t1', state:'ACTIVE', confidence:'MEDIUM', observedWeeks:8, serviceEvidenceWeeks:8, travelEvidenceWeeks:6,
  service:{ completedVisits:{median:5,p75:7,p90:9}, coolerCount:{median:1,p75:2,p90:3}, towerCount:{median:1,p75:2,p90:3}, tapCount:{median:1,p75:2,p90:3}, smarttapCount:{median:0,p75:1,p90:2} },
  travel:{ routeDistanceMeters:{median:0,p75:1000,p90:2000}, fieldP90RadiusMeters:{median:0,p75:1000,p90:2000}, routeCoherenceRatio:{median:0,p75:1,p90:2}, fragmentationRatio:{median:0,p75:0.5,p90:1} },
  context:{ uniqueVisitedPoints:{median:1,p75:2,p90:3}, paperworkCompletionMinutes:{median:null,p75:null,p90:null}, suspiciousVisitRate:{median:0,p75:0,p90:0}, lateEntryMinutes:{median:null,p75:null,p90:null} }, reasons:[],
};
function controller() {
  const prisma:any = {
    user:{ findMany: async () => [{ id:'t1', name:'Tech', username:'tech' }], findFirst: async ({where}:any) => where.id === 't1' || where.id === 't2' ? {id:where.id} : null },
    point:{ findMany: async () => [{ id:'p1', code:'P1', name:'Point', region:{name:'R1'} }] },
  };
  const maturity:any = { assess:() => ({ overallState:'ACTIVE', overallScore:80, evidence:{weeks:8,visits:20,attempts:2,activePoints:1,locatedPoints:1,activeTechnicians:1,regions:1,suspiciousVisits:0,reviewRecommended:0,locationCoverage:1,equipmentProfileCoverage:1}, capabilities:[{capability:'RISK',state:'ACTIVE',score:80,qualityScore:90,reasons:[]},{capability:'RECOMMENDATION',state:'ACTIVE',score:80,qualityScore:90,reasons:[]}] }) };
  const weekly:any = { assess:() => ({ technicianId:'t1', evidenceState:'READY', baselineState:'ACTIVE', baselineConfidence:'MEDIUM', assigned:{standardCurrent:1,standardCarryover:0,smartcleanCurrent:0,smartcleanCarryover:0}, servicePressure:{coolerCount:'WITHIN_BASELINE',towerCount:'WITHIN_BASELINE',tapCount:'WITHIN_BASELINE',smarttapCount:'WITHIN_BASELINE'}, travelPressure:{routeDistanceMeters:'WITHIN_BASELINE',fieldP90RadiusMeters:'WITHIN_BASELINE',routeCoherenceRatio:'WITHIN_BASELINE',fragmentationRatio:'WITHIN_BASELINE',workAreaProximity:'WITHIN_BASELINE'}, reasons:[] }) };
  const risk:any = { assessTechnician:() => ({state:'READY',severity:'LOW',confidence:'MEDIUM',signals:[],reasons:[]}), assessPoint:() => ({state:'READY',severity:'LOW',confidence:'MEDIUM',signals:[],reasons:[]}) };
  const planning:any = { assess:() => ({engineVersion:AI_ENGINE_VERSION,featureSchemaVersion:AI_FEATURE_SCHEMA_VERSION,state:'READY',recommendations:[],reasons:[]}) };
  const difficulty:any = { assess:() => [{ pointId:'p1', state:'ACTIVE', confidence:'MEDIUM', score:10, rawOutcomeScore:10, calibration:{confidence:'MEDIUM',evidence:10,effectiveEvidence:5,estimatedRate:0.1,factors:[],reasonCodes:[]}, equipmentProfileComplete:true, equipmentProfile:{confidence:'HIGH',confidenceScore:90,complete:true,verifiedVisitCount:1,lastVerifiedAt:null,verificationAgeDays:1,observedSnapshotCount:1,changeCount:0,changeRate:0,stability:'STABLE',anomalyCodes:[],reasons:[]}, equipment:{coolerCount:1,towerCount:1,tapCount:1,smarttapCount:0}, geography:{located:true,isolated:false,nearestNeighborMeters:10}, history:{visits:5,attempts:0,missed:0,completed:5,observedPeriods:5}, reasons:[] }] };
  const assignedWorkload:any = { forWeek:async () => ({weekKey:'2026-W37',technicians:[assigned],unassigned:{standardCurrent:0,standardCarryover:0,smartcleanCurrent:0,smartcleanCarryover:0}}) };
  const baselines:any = { assess:() => [baseline], assessTechnician:() => baseline };
  const featureStore:any = { buildWeeklySnapshot:async () => snapshot };
  const location:any = { assess:() => [{pointId:'p1',state:'STRONG',confidenceScore:90,confidence:'HIGH',evidenceVisits:5,contradictionCount:0,reasonCodes:[]}] };
  const simple:any = { assess:() => [], evaluate:() => ({state:'READY',evaluatedPredictions:0,skippedPredictions:0,truePositive:0,falsePositive:0,trueNegative:0,falseNegative:0,precision:null,recall:null,accuracy:null,reasonCodes:[]}), find:() => [] };
  const summaries:any = { technicianDaily:() => [], adminDaily:() => ({state:'HEALTHY',reasonCodes:[]}), period:() => ({state:'HEALTHY',reasonCodes:[]}) };
  const feedback:any = { record:async () => ({}), list:async () => [] };
  const calibration:any = { assess:() => ({engineVersion:AI_ENGINE_VERSION,featureSchemaVersion:AI_FEATURE_SCHEMA_VERSION,confidence:'LOW',equipment:[],travel:[],drift:[],reasonCodes:[]}) };
  const telemetry:any = { measure: async (_name:string, fn:any) => fn(), snapshot:() => ({engineVersion:AI_ENGINE_VERSION,featureSchemaVersion:AI_FEATURE_SCHEMA_VERSION,generatedAt:'2026-09-14T00:00:00.000Z',operations:[]}) };
  const distributionDrift:any = { observe:() => undefined, snapshot:() => ({engineVersion:AI_ENGINE_VERSION,featureSchemaVersion:AI_FEATURE_SCHEMA_VERSION,observationCount:4,state:'STABLE',maxAbsoluteDelta:0,risk:{},recommendation:{},reasonCodes:['AI_OUTPUT_DISTRIBUTION_STABLE']}) };
  return new AdminAiController(prisma,summaries,simple,featureStore,maturity,simple,location,baselines,simple,difficulty,assignedWorkload,weekly,risk,planning,simple,feedback,simple,simple,calibration,telemetry,distributionDrift);
}
test('admin dashboard endpoint contract exposes versioned explainable AI sections', async () => {
  const c:any = controller();
  c.dataQuality = { assess:() => ({engineVersion:AI_ENGINE_VERSION,featureSchemaVersion:AI_FEATURE_SCHEMA_VERSION,score:100,confidence:'HIGH',issues:[],reasonCodes:[]}) };
  c.regionHealth = { assess:() => [] };
  c.trends = { assess:() => ({engineVersion:AI_ENGINE_VERSION,featureSchemaVersion:AI_FEATURE_SCHEMA_VERSION,weekly:[],regions:[],technicians:[],points:[]}) };
  c.backtest = { evaluate:() => ({engineVersion:AI_ENGINE_VERSION,state:'READY',evaluatedPredictions:0,skippedPredictions:0,truePositive:0,falsePositive:0,trueNegative:0,falseNegative:0,precision:null,recall:null,accuracy:null,reasonCodes:[]}) };
  c.similarWeeks = { find:() => [] };
  const result = await c.adminDashboard('4');
  assert.equal(result.engineVersion, AI_ENGINE_VERSION);
  assert.equal(result.featureSchemaVersion, AI_FEATURE_SCHEMA_VERSION);
  assert.equal(result.technicians.length, 1);
  assert.ok(result.planning);
  assert.ok(result.dataQuality);
  assert.ok(result.calibration);
  assert.ok(result.telemetry);
  assert.equal(result.outputDistributionDrift.state, 'STABLE');
  assert.ok(result.summaries);
  assert.ok(Array.isArray(result.pointDifficulty));
});

test('what-if endpoint contract stays simulation-only and returns comparable risk output', async () => {
  const c:any = controller();
  c.whatIf = { simulate:() => ({engineVersion:AI_ENGINE_VERSION,featureSchemaVersion:AI_FEATURE_SCHEMA_VERSION,technicianId:'t1',riskDelta:0,confidence:'MEDIUM',reasons:[],before:{},after:{}}) };
  const result = await c.simulateWhatIf({ technicianId:'t1', coolerDelta:1 });
  assert.equal(result.engineVersion, AI_ENGINE_VERSION);
  assert.equal(result.featureSchemaVersion, AI_FEATURE_SCHEMA_VERSION);
  assert.equal(result.technicianId, 't1');
  assert.equal(typeof result.riskDelta, 'number');
  assert.equal(result.confidence, 'MEDIUM');
});
