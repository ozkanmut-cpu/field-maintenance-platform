'use client';
import { useEffect, useState } from 'react';

type Technician = { id: string; name: string };
type Activity = { completedMaintenance: number; ownMaintenance: number; attemptCount: number;
  successRate: number | null; nonMaintenanceVisitCount: number; prospectVisitCount: number;
  enteredLate: number; helpedMaintenance: number; helpedAttempts: number;
  receivedHelpMaintenance: number; receivedHelpAttempts: number };
type Report = {
  from: string; to: string; metrics: Activity & { currentOpen: number; overdueOpen: number; unassignedOpen: number };
  paperwork: { serviceSlip: Statuses; confirmation: Statuses };
  daily: Array<{ date: string } & Activity>;
  technicians: Array<{ technicianId: string; name: string } & Activity>;
};
type Statuses = { pending: number; present: number; missing: number };
type Filters = { from: string; to: string; technicianId: string };
type Setters = { report: (value: Report | null) => void; error: (value: string) => void; loading: (value: boolean) => void };
type FetchResult = { ok: boolean; status?: number; json: () => Promise<any> };

function dateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function shift(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startKpiRequest(filters: Filters, set: Setters,
  fetcher: (url: string, init?: RequestInit) => Promise<FetchResult> = (url, init) => fetch(url, init)) {
  let active = true;
  const controller = new AbortController();
  set.report(null);
  set.error('');
  set.loading(true);
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.technicianId) params.set('technicianId', filters.technicianId);
  void fetcher(`/api/backend/maintenance/admin-kpi-reporting?${params.toString()}`, { signal: controller.signal })
    .then(async response => {
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
      if (active) set.report(body as Report);
    })
    .catch(error => { if (active) set.error(error instanceof Error ? error.message : String(error)); })
    .finally(() => { if (active) set.loading(false); });
  return () => { active = false; controller.abort(); };
}

function StatusRow({ label, value }: { label: string; value: Statuses }) {
  return <tr><td><strong>{label}</strong></td><td>{value.pending}</td><td>{value.present}</td><td>{value.missing}</td></tr>;
}
function rate(value: number | null) { return value === null ? '—' : `%${value.toLocaleString('tr-TR')}`; }

export function KpiReportView({ report }: { report: Report }) {
  const m = report.metrics;
  return <div>
    <section className="dashboardGrid">
      <div className="dashboardCard"><span>Başarı oranı</span><strong>{rate(m.successRate)}</strong><small>Bakım / (bakım + yapılamadı)</small></div>
      <div className="dashboardCard"><span>Tamamlanan bakım</span><strong>{m.completedMaintenance}</strong><small>Kendi işi: {m.ownMaintenance} · Geç giriş: {m.enteredLate}</small></div>
      <div className="dashboardCard"><span>Yapılamadı</span><strong>{m.attemptCount}</strong><small>Bakım dışı: {m.nonMaintenanceVisitCount} · Prospect: {m.prospectVisitCount}</small></div>
      <div className="dashboardCard"><span>Yardım verdi</span><strong>{m.helpedMaintenance} / {m.helpedAttempts}</strong><small>Bakım / yapılamadı</small></div>
      <div className="dashboardCard"><span>Yardım aldı</span><strong>{m.receivedHelpMaintenance} / {m.receivedHelpAttempts}</strong><small>Bakım / yapılamadı</small></div>
      <div className="dashboardCard"><span>Dönem sonu açık</span><strong>{m.currentOpen} / {m.overdueOpen}</strong><small>Güncel / geciken · Atamasız: {m.unassignedOpen}</small></div>
    </section>
    <p className="muted">Evrak sayıları dönem içindeki bakımların mevcut durumudur. Açık görevler dönem sonu için yeniden oluşturulan tarihsel görünümdür.</p>
    <div className="tableWrap"><table><thead><tr><th>Evrak</th><th>Bekliyor</th><th>Var</th><th>Eksik</th></tr></thead>
      <tbody><StatusRow label="Servis fişi" value={report.paperwork.serviceSlip} /><StatusRow label="Teyit" value={report.paperwork.confirmation} /></tbody></table></div>
    <div className="tableWrap"><table><thead><tr><th>Günlük trend</th><th>Bakım</th><th>Yapılamadı</th><th>Başarı</th><th>Yardım verdi</th><th>Yardım aldı</th></tr></thead>
      <tbody>{report.daily.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.completedMaintenance}</td><td>{row.attemptCount}</td><td>{rate(row.successRate)}</td><td>{row.helpedMaintenance}</td><td>{row.receivedHelpMaintenance}</td></tr>)}</tbody></table></div>
    <div className="tableWrap"><table><thead><tr><th>Teknisyen</th><th>Bakım</th><th>Yapılamadı</th><th>Başarı</th><th>Yardım verdi</th><th>Yardım aldı</th></tr></thead>
      <tbody>{report.technicians.length ? report.technicians.map(row => <tr key={row.technicianId}><td><strong>{row.name}</strong></td><td>{row.completedMaintenance}</td><td>{row.attemptCount}</td><td>{rate(row.successRate)}</td><td>{row.helpedMaintenance}</td><td>{row.receivedHelpMaintenance}</td></tr>) : <tr><td colSpan={6}>Dönemde teknisyen hareketi yok.</td></tr>}</tbody></table></div>
  </div>;
}

export default function KpiReportingPanel({ technicians }: { technicians: Technician[] }) {
  const today = dateKey();
  const [filters, setFilters] = useState<Filters>({ from: shift(today, -29), to: today, technicianId: '' });
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => startKpiRequest(filters, { report: setReport, error: setError, loading: setLoading }), [filters]);
  const change = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  return <section className="panel">
    <div className="panelHeader"><div><h2>KPI / Raporlama</h2><p>Seçilen İstanbul tarih aralığında saha başarısı, yardım hareketleri ve dönem sonu iş yükü.</p></div>
      <div className="rowActions">
        <input aria-label="KPI başlangıç tarihi" type="date" value={filters.from} onChange={e => change('from', e.target.value)} />
        <input aria-label="KPI bitiş tarihi" type="date" value={filters.to} onChange={e => change('to', e.target.value)} />
        <select aria-label="KPI teknisyen filtresi" value={filters.technicianId} onChange={e => change('technicianId', e.target.value)}>
          <option value="">Tüm teknisyenler</option>{technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
    </div>
    {error ? <div className="error">{error}</div> : null}
    {report ? <KpiReportView report={report} /> : <div className="emptyState compact"><strong>{loading ? 'KPI raporu hazırlanıyor' : 'KPI raporu bulunamadı'}</strong><span>{filters.from} – {filters.to}</span></div>}
  </section>;
}
