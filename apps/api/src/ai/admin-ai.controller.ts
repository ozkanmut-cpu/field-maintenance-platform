import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AssignedWeeklyWorkloadService } from './assigned-weekly-workload.service';
import { BacktestService } from './backtest.service';
import { DataMaturityService } from './data-maturity.service';
import { DataQualityEngineService } from './data-quality-engine.service';
import { WhatIfDto } from './dto/what-if.dto';
import { FeatureStoreService } from './feature-store.service';
import { FeatureSnapshot } from './feature-store.types';
import { PointDifficultyService } from './point-difficulty.service';
import { LocationIntelligenceService } from './location-intelligence.service';
import { PlanningEngineService } from './planning-engine.service';
import { RegionHealthService } from './region-health.service';
import { RiskEngineService } from './risk-engine.service';
import { SimilarWeekService } from './similar-week.service';
import { AI_ENGINE_VERSION, AI_FEATURE_SCHEMA_VERSION } from './ai-version';
import { TechnicianBaselineService } from './technician-baseline.service';
import { WeeklyWorkloadService } from './weekly-workload.service';
import { WhatIfService } from './what-if.service';

@Controller('ai')
export class AdminAiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backtest: BacktestService,
    private readonly featureStore: FeatureStoreService,
    private readonly maturity: DataMaturityService,
    private readonly dataQuality: DataQualityEngineService,
    private readonly locations: LocationIntelligenceService,
    private readonly baselines: TechnicianBaselineService,
    private readonly difficulties: PointDifficultyService,
    private readonly assignedWorkload: AssignedWeeklyWorkloadService,
    private readonly weeklyWorkload: WeeklyWorkloadService,
    private readonly riskEngine: RiskEngineService,
    private readonly planningEngine: PlanningEngineService,
    private readonly regionHealth: RegionHealthService,
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
      regionHealth: this.regionHealth.assess(history),
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
    const [assigned, technician] = await Promise.all([
      this.assignedWorkload.forWeek(now),
      this.prisma.user.findFirst({ where: { id: dto.technicianId, role: UserRole.TECHNICIAN, active: true }, select: { id: true } }),
    ]);
    if (!technician) throw new NotFoundException('Aktif teknisyen bulunamadı');
    const workload = assigned.technicians.find((item) => item.technicianId === dto.technicianId) ?? {
      technicianId: dto.technicianId,
      standardCurrent: 0, standardCarryover: 0, smartcleanCurrent: 0, smartcleanCarryover: 0,
      equipmentKnownPointCount: 0, equipmentUnknownPointCount: 0,
      assignedCoolerCount: 0, assignedTowerCount: 0, assignedTapCount: 0, assignedSmarttapCount: 0,
      assignedLocatedPointCount: 0, assignedUnlocatedPointCount: 0,
      assignedFieldP90RadiusMeters: null, assignedRouteEstimateMeters: null,
    };
    const baseline = this.baselines.assessTechnician(history, dto.technicianId);
    const maturity = this.maturity.assess(history);
    const riskMaturity = maturity.capabilities.find((item) => item.capability === 'RISK');
    const { technicianId: _technicianId, ...change } = dto;
    return this.whatIf.simulate(workload, baseline, riskMaturity, change);
  }

}
