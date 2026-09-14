import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AssignedWeeklyWorkloadService } from './assigned-weekly-workload.service';
import { AiSummaryService } from './ai-summary.service';
import { BacktestService } from './backtest.service';
import { DataMaturityService } from './data-maturity.service';
import { DataQualityEngineService } from './data-quality-engine.service';
import { WhatIfDto } from './dto/what-if.dto';
import { RecommendationFeedbackDto } from './dto/recommendation-feedback.dto';
import { FeatureStoreService } from './feature-store.service';
import { FeatureSnapshot } from './feature-store.types';
import { PointDifficultyService } from './point-difficulty.service';
import { LocationIntelligenceService } from './location-intelligence.service';
import { PlanningEngineService } from './planning-engine.service';
import { RegionHealthService } from './region-health.service';
import { RecommendationFeedbackService } from './recommendation-feedback.service';
import { RiskEngineService } from './risk-engine.service';
import { SimilarWeekService } from './similar-week.service';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import { TechnicianBaselineService } from './technician-baseline.service';
import { TrendService } from './trend.service';
import { WeeklyWorkloadService } from './weekly-workload.service';
import { RegionWorkloadVector, WhatIfService } from './what-if.service';

@Controller('ai')
export class AdminAiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly summaries: AiSummaryService,
    private readonly backtest: BacktestService,
    private readonly featureStore: FeatureStoreService,
    private readonly maturity: DataMaturityService,
    private readonly dataQuality: DataQualityEngineService,
    private readonly locations: LocationIntelligenceService,
    private readonly baselines: TechnicianBaselineService,
    private readonly trends: TrendService,
    private readonly difficulties: PointDifficultyService,
    private readonly assignedWorkload: AssignedWeeklyWorkloadService,
    private readonly weeklyWorkload: WeeklyWorkloadService,
    private readonly riskEngine: RiskEngineService,
    private readonly planningEngine: PlanningEngineService,
    private readonly regionHealth: RegionHealthService,
    private readonly recommendationFeedback: RecommendationFeedbackService,
    private readonly similarWeeks: SimilarWeekService,
    private readonly whatIf: WhatIfService,
  ) {}

  @Roles(UserRole.ADMIN)
  @Get('admin-dashboard')
  async adminDashboard(@Query('weeks') weeksQuery?: string) {
    const requested = Number(weeksQuery ?? 12);
    const weeks = Number.isFinite(requested) ? Math.min(16, Math.max(4, Math.floor(requested))) : 12;
    const now = new Date();
    const history: FeatureSnapshot[] = [];
    for (let offset = weeks - 1; offset >= 0; offset -= 1) {
      const asOf = new Date(now);
      asOf.setUTCDate(asOf.getUTCDate() - offset * 7);
      history.push(await this.featureStore.buildWeeklySnapshot(asOf));
    }

    const [assigned, technicians, points] = await Promise.all([
      this.assignedWorkload.forWeek(now),
      this.prisma.user.findMany({
        where: { role: UserRole.TECHNICIAN, active: true },
        select: { id: true, name: true, username: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.point.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true, name: true, region: { select: { name: true } } },
      }),
    ]);

    const maturity = this.maturity.assess(history);
    const riskMaturity = maturity.capabilities.find((item) => item.capability === 'RISK');
    const recommendationMaturity = maturity.capabilities.find((item) => item.capability === 'RECOMMENDATION');
    const baselineByTechnician = new Map(this.baselines.assess(history).map((item) => [item.technicianId, item]));
    const workloadByTechnician = new Map(assigned.technicians.map((item) => [item.technicianId, item]));
    const technicianRows = technicians.map((technician) => {
      const baseline = baselineByTechnician.get(technician.id) ?? this.baselines.assessTechnician(history, technician.id);
      const workload = workloadByTechnician.get(technician.id) ?? {
        technicianId: technician.id,
        standardCurrent: 0,
        standardCarryover: 0,
        smartcleanCurrent: 0,
        smartcleanCarryover: 0,
        equipmentKnownPointCount: 0,
        equipmentUnknownPointCount: 0,
        assignedCoolerCount: 0,
        assignedTowerCount: 0,
        assignedTapCount: 0,
        assignedSmarttapCount: 0,
        assignedLocatedPointCount: 0,
        assignedUnlocatedPointCount: 0,
        assignedFieldP90RadiusMeters: null,
        assignedRouteEstimateMeters: null,
        assignedRouteCoherenceRatio: null, assignedClusterCount: 0, assignedIsolatedPointCount: 0,
        assignedFragmentationRatio: null, workAreaCenterDistanceMeters: null,
      };
      const assessment = this.weeklyWorkload.assess(workload, baseline);
      return {
        ...technician,
        baseline,
        workload,
        assessment,
        risk: this.riskEngine.assessTechnician(workload, baseline, assessment, riskMaturity),
      };
    });

    const planning = this.planningEngine.assess(
      technicianRows.map((item) => ({ technicianId: item.id, assigned: item.workload, workload: item.assessment, risk: item.risk })),
      recommendationMaturity,
    );

    const pointMeta = new Map(points.map((point) => [point.id, point]));
    const locationByPoint = new Map(this.locations.assess(history).map((item) => [item.pointId, item]));
    const pointDifficulty = this.difficulties.assess(history)
      .map((item) => ({
        ...item,
        risk: this.riskEngine.assessPoint(item, riskMaturity),
        location: locationByPoint.get(item.pointId) ?? null,
        point: pointMeta.get(item.pointId) ?? null,
      }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.history.attempts - a.history.attempts);

    const regionHealth = this.regionHealth.assess(history);
    const summaryInputs = technicianRows.map((item) => ({
      technicianId: item.id,
      name: item.name,
      currentWork: item.workload.standardCurrent + item.workload.smartcleanCurrent,
      carryover: item.workload.standardCarryover + item.workload.smartcleanCarryover,
      risk: item.risk,
      suspiciousVisits: item.workload.currentWeekSuspiciousVisitCount ?? 0,
      paperworkPending: item.workload.currentWeekPaperworkPendingCount ?? 0,
    }));
    const summaries = {
      technicians: summaryInputs.map((item) => this.summaries.technicianDaily(item)),
      adminDaily: this.summaries.adminDaily(summaryInputs, regionHealth, planning),
      period: this.summaries.period(history.at(-1)?.weekKey ?? null, summaryInputs, regionHealth),
    };

    return {
      weeks,
      generatedAt: new Date().toISOString(),
      engineVersion: AI_ENGINE_VERSION,
      featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
      currentWeek: history.at(-1)?.weekKey ?? null,
      maturity,
      unassigned: assigned.unassigned,
      technicians: technicianRows,
      planning,
      backtest: this.backtest.evaluate(history),
      regionHealth,
      summaries,
      trends: this.trends.assess(history),
      dataQuality: this.dataQuality.assess(history),
      similarWeeks: this.similarWeeks.find(history),
      pointDifficulty,
    };
  }

  @Roles(UserRole.ADMIN)
  @Post('what-if')
  async simulateWhatIf(@Body() dto: WhatIfDto) {
    const now = new Date();
    const history: FeatureSnapshot[] = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const asOf = new Date(now);
      asOf.setUTCDate(asOf.getUTCDate() - offset * 7);
      history.push(await this.featureStore.buildWeeklySnapshot(asOf));
    }
    const [assigned, technician, targetTechnician] = await Promise.all([
      this.assignedWorkload.forWeek(now),
      this.prisma.user.findFirst({ where: { id: dto.technicianId, role: UserRole.TECHNICIAN, active: true }, select: { id: true } }),
      dto.targetTechnicianId
        ? this.prisma.user.findFirst({ where: { id: dto.targetTechnicianId, role: UserRole.TECHNICIAN, active: true }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!technician) throw new NotFoundException('Aktif teknisyen bulunamadı');
    if (dto.targetTechnicianId && !targetTechnician) throw new NotFoundException('Hedef aktif teknisyen bulunamadı');
    const workload = assigned.technicians.find((item) => item.technicianId === dto.technicianId) ?? {
      technicianId: dto.technicianId,
      standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0,
      equipmentKnownPointCount: 0, equipmentUnknownPointCount: 0,
      assignedCoolerCount: 0, assignedTowerCount: 0, assignedTapCount: 0, assignedSmarttapCount: 0,
      assignedLocatedPointCount: 0, assignedUnlocatedPointCount: 0,
      assignedFieldP90RadiusMeters: null, assignedRouteEstimateMeters: null, assignedRouteCoherenceRatio: null,
      assignedClusterCount: 0, assignedIsolatedPointCount: 0, assignedFragmentationRatio: null, workAreaCenterDistanceMeters: null,
    };
    const baseline = this.baselines.assessTechnician(history, dto.technicianId);
    const maturity = this.maturity.assess(history);
    const riskMaturity = maturity.capabilities.find((item) => item.capability === 'RISK');
    const { technicianId: _technicianId, targetTechnicianId: _targetTechnicianId, regionId: _regionId, ...change } = dto;
    if (dto.regionId) {
      const region = history.at(-1)?.records.find((record) => record.entityType === 'REGION' && record.entityId === dto.regionId);
      if (!region) throw new NotFoundException('Bölge bulunamadı');
      const f = region.features;
      const vector: RegionWorkloadVector = {
        regionId: dto.regionId,
        standardCurrent: Number(f.standardCurrentWorkloadCount ?? 0),
        standardCarryover: Number(f.standardCarryoverWorkloadCount ?? 0),
        smartcleanCurrent: Number(f.smartcleanCurrentWorkloadCount ?? 0),
        smartcleanCarryover: Number(f.smartcleanCarryoverWorkloadCount ?? 0),
        equipmentKnownPointCount: Number(f.equipmentKnownPointCount ?? 0),
        equipmentUnknownPointCount: Number(f.equipmentUnknownPointCount ?? 0),
        coolerCount: Number(f.coolerCount ?? 0), towerCount: Number(f.towerCount ?? 0), tapCount: Number(f.tapCount ?? 0), smarttapCount: Number(f.smarttapCount ?? 0),
        locatedPointCount: Number(f.locatedPointCount ?? 0),
        unlocatedPointCount: Math.max(0, Number(f.pointCount ?? 0) - Number(f.locatedPointCount ?? 0)),
        p90RadiusMeters: typeof f.p90RadiusMeters === 'number' ? f.p90RadiusMeters : null,
        fragmentationRatio: typeof f.geographicFragmentationRatio === 'number' ? f.geographicFragmentationRatio : null,
      };
      const targetId = dto.targetTechnicianId ?? dto.technicianId;
      const targetWorkload = assigned.technicians.find((item) => item.technicianId === targetId) ?? { ...workload, technicianId: targetId };
      const targetBaseline = this.baselines.assessTechnician(history, targetId);
      return this.whatIf.simulateRegionPlacement(vector, typeof f.assignedTechnicianId === 'string' ? f.assignedTechnicianId : null, targetWorkload, targetBaseline, riskMaturity);
    }
    if (!dto.targetTechnicianId) return this.whatIf.simulate(workload, baseline, riskMaturity, change);

    const targetWorkload = assigned.technicians.find((item) => item.technicianId === dto.targetTechnicianId) ?? {
      technicianId: dto.targetTechnicianId,
      standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0,
      equipmentKnownPointCount: 0, equipmentUnknownPointCount: 0,
      assignedCoolerCount: 0, assignedTowerCount: 0, assignedTapCount: 0, assignedSmarttapCount: 0,
      assignedLocatedPointCount: 0, assignedUnlocatedPointCount: 0,
      assignedFieldP90RadiusMeters: null, assignedRouteEstimateMeters: null, assignedRouteCoherenceRatio: null,
      assignedClusterCount: 0, assignedIsolatedPointCount: 0, assignedFragmentationRatio: null, workAreaCenterDistanceMeters: null,
    };
    const targetBaseline = this.baselines.assessTechnician(history, dto.targetTechnicianId);
    return this.whatIf.comparePlacement(workload, baseline, targetWorkload, targetBaseline, riskMaturity, change);
  }


  @Roles(UserRole.ADMIN)
  @Post('recommendation-feedback')
  recordRecommendationFeedback(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecommendationFeedbackDto) {
    return this.recommendationFeedback.record(user.id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Get('recommendation-feedback')
  recommendationFeedbackHistory(@Query('limit') limit?: string) {
    return this.recommendationFeedback.list(limit ? Number(limit) : 100);
  }

}
