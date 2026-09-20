import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaperworkStatus, UserRole, VisitStatus } from '@prisma/client';
import { businessDateKey, businessDayRange } from '../common/business-time';
import { PrismaService } from '../prisma/prisma.service';
import { MaintenanceEngineService } from './maintenance-engine.service';

type Query = { from?: string; to?: string; technicianId?: string };
type Activity = { completedMaintenance: number; ownMaintenance: number; attemptCount: number;
  successRate: number | null; nonMaintenanceVisitCount: number; prospectVisitCount: number;
  enteredLate: number; helpedMaintenance: number; helpedAttempts: number;
  receivedHelpMaintenance: number; receivedHelpAttempts: number };

@Injectable()
export class KpiReportingService {
  constructor(private readonly prisma: PrismaService, private readonly engine: MaintenanceEngineService) {}

  async report(query: Query, now = new Date()) {
    if (Number.isNaN(now.getTime())) throw new BadRequestException('now geçersiz tarih');
    const today = businessDateKey(now);
    if (query.from === '' || query.to === '') throw new BadRequestException('Tarih boş olamaz');
    const to = query.to ?? today;
    const from = query.from ?? this.shift(to, -29);
    const fromDate = this.parse(from, 'from');
    const toDate = this.parse(to, 'to');
    const todayDate = this.parse(today, 'today');
    const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    if (days < 1) throw new BadRequestException('Başlangıç tarihi bitişten sonra olamaz');
    if (days > 180) throw new BadRequestException('KPI raporu en fazla 180 günü destekler');
    if (toDate > todayDate) throw new BadRequestException('Gelecek tarih için KPI raporu oluşturulamaz');

    let selected: { id: string; name: string; username?: string } | null = null;
    if (query.technicianId) {
      selected = await this.prisma.user.findFirst({
        where: { id: query.technicianId, role: UserRole.TECHNICIAN },
        select: { id: true, name: true, username: true },
      });
      if (!selected) throw new NotFoundException('Teknisyen bulunamadı');
    }

    const start = businessDayRange(new Date(`${from}T12:00:00+03:00`)).start;
    const end = businessDayRange(new Date(`${to}T12:00:00+03:00`)).end;
    const relationFilter = query.technicianId
      ? { OR: [{ technicianId: query.technicianId }, { assistedForTechnicianId: query.technicianId }] }
      : {};
    const actorFilter = query.technicianId ? { technicianId: query.technicianId } : {};
    const [due, users, visits, attempts, otherVisits, prospectVisits] = await Promise.all([
      this.engine.dueSnapshot(to, { readOnly: true }),
      this.prisma.user.findMany({
        where: { role: UserRole.TECHNICIAN },
        select: { id: true, name: true, username: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.maintenanceVisit.findMany({
        where: { status: VisitStatus.VALID, performedAt: { gte: start, lt: end }, ...relationFilter },
        select: { id: true, technicianId: true, assistedForTechnicianId: true, performedAt: true,
          enteredLate: true, serviceSlipStatus: true, confirmationStatus: true },
      }),
      this.prisma.maintenanceAttempt.findMany({
        where: { attemptedAt: { gte: start, lt: end }, ...relationFilter },
        select: { id: true, technicianId: true, assistedForTechnicianId: true, attemptedAt: true },
      }),
      this.prisma.nonMaintenanceVisit.findMany({
        where: { visitedAt: { gte: start, lt: end }, ...actorFilter },
        select: { technicianId: true, visitedAt: true },
      }),
      this.prisma.prospectVisit.findMany({
        where: { visitedAt: { gte: start, lt: end }, ...actorFilter },
        select: { technicianId: true, visitedAt: true },
      }),
    ]);

    const actorVisits = query.technicianId ? visits.filter(v => v.technicianId === query.technicianId) : visits;
    const actorAttempts = query.technicianId ? attempts.filter(v => v.technicianId === query.technicianId) : attempts;
    const responsibleVisits = query.technicianId
      ? visits.filter(v => v.technicianId === query.technicianId && !v.assistedForTechnicianId
        || v.technicianId !== query.technicianId && v.assistedForTechnicianId === query.technicianId)
      : visits;
    const assignedDue = query.technicianId ? due.items.filter((i: any) => i.technicianId === query.technicianId) : due.items;
    const metrics = this.activity(actorVisits, actorAttempts, otherVisits, prospectVisits, visits, attempts, query.technicianId);
    Object.assign(metrics, {
      currentOpen: assignedDue.filter((i: any) => i.priority === 'CURRENT').length,
      overdueOpen: assignedDue.filter((i: any) => i.priority === 'OVERDUE').length,
      unassignedOpen: query.technicianId ? 0 : due.items.filter((i: any) => !i.technicianId).length,
    });

    const dates = Array.from({ length: days }, (_, i) => this.shift(from, i));
    const daily = dates.map(date => {
      const dateVisits = actorVisits.filter(v => businessDateKey(v.performedAt) === date);
      const dateAttempts = actorAttempts.filter(v => businessDateKey(v.attemptedAt) === date);
      return { date, ...this.activity(dateVisits, dateAttempts,
        otherVisits.filter(v => businessDateKey(v.visitedAt) === date),
        prospectVisits.filter(v => businessDateKey(v.visitedAt) === date),
        visits.filter(v => businessDateKey(v.performedAt) === date),
        attempts.filter(v => businessDateKey(v.attemptedAt) === date), query.technicianId) };
    });

    const involvedIds = new Set([...visits.map(v => v.technicianId), ...attempts.map(v => v.technicianId),
      ...visits.flatMap(v => v.assistedForTechnicianId ? [v.assistedForTechnicianId] : []),
      ...attempts.flatMap(v => v.assistedForTechnicianId ? [v.assistedForTechnicianId] : []),
      ...otherVisits.map(v => v.technicianId), ...prospectVisits.map(v => v.technicianId)]);
    const technicianSource = query.technicianId ? [selected!] : users.filter(u => involvedIds.has(u.id));
    const technicians = technicianSource.map(user => {
      const ownVisits = visits.filter(v => v.technicianId === user.id);
      const ownAttempts = attempts.filter(v => v.technicianId === user.id);
      return { technicianId: user.id, name: user.name, username: user.username,
        ...this.activity(ownVisits, ownAttempts, otherVisits.filter(v => v.technicianId === user.id),
          prospectVisits.filter(v => v.technicianId === user.id), visits, attempts, user.id) };
    });

    return { from, to, technicianId: query.technicianId ?? null, generatedAt: now.toISOString(),
      metrics, paperwork: {
        serviceSlip: this.paperwork(responsibleVisits, 'serviceSlipStatus'),
        confirmation: this.paperwork(responsibleVisits, 'confirmationStatus'),
      }, daily, technicians };
  }

  private activity(actorVisits: any[], actorAttempts: any[], others: any[], prospects: any[],
    relatedVisits: any[], relatedAttempts: any[], technicianId?: string): Activity {
    const completed = actorVisits.length;
    const attempts = actorAttempts.length;
    const helpedVisits = actorVisits.filter(v => v.assistedForTechnicianId && v.assistedForTechnicianId !== v.technicianId).length;
    const helpedAttempts = actorAttempts.filter(v => v.assistedForTechnicianId && v.assistedForTechnicianId !== v.technicianId).length;
    const receivedVisits = technicianId
      ? relatedVisits.filter(v => v.technicianId !== technicianId && v.assistedForTechnicianId === technicianId).length
      : relatedVisits.filter(v => v.assistedForTechnicianId && v.assistedForTechnicianId !== v.technicianId).length;
    const receivedAttempts = technicianId
      ? relatedAttempts.filter(v => v.technicianId !== technicianId && v.assistedForTechnicianId === technicianId).length
      : relatedAttempts.filter(v => v.assistedForTechnicianId && v.assistedForTechnicianId !== v.technicianId).length;
    return {
      completedMaintenance: completed,
      ownMaintenance: actorVisits.filter(v => !v.assistedForTechnicianId || v.assistedForTechnicianId === v.technicianId).length,
      attemptCount: attempts,
      successRate: completed + attempts ? Math.round(completed / (completed + attempts) * 1000) / 10 : null,
      nonMaintenanceVisitCount: others.length,
      prospectVisitCount: prospects.length,
      enteredLate: actorVisits.filter(v => v.enteredLate).length,
      helpedMaintenance: helpedVisits, helpedAttempts,
      receivedHelpMaintenance: receivedVisits, receivedHelpAttempts: receivedAttempts,
    };
  }

  private paperwork(visits: any[], field: 'serviceSlipStatus' | 'confirmationStatus') {
    return {
      pending: visits.filter(v => v[field] === PaperworkStatus.PENDING || (field === 'serviceSlipStatus' && v[field] === PaperworkStatus.PENDING_REVIEW)).length,
      present: visits.filter(v => v[field] === PaperworkStatus.PRESENT).length,
      missing: visits.filter(v => v[field] === PaperworkStatus.MISSING).length,
      approved: visits.filter(v => v[field] === PaperworkStatus.APPROVED).length,
    };
  }
  private parse(key: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new BadRequestException(`${field} YYYY-MM-DD formatında olmalıdır`);
    const date = new Date(`${key}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) throw new BadRequestException(`${field} geçersiz tarih`);
    return date;
  }
  private shift(key: string, days: number) {
    const date = this.parse(key, 'date');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
}
