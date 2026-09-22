'use client';

import { useEffect, useRef, useState } from 'react';

type Technician = { id: string; name: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type Summary = {
  technician: { name: string }; date: string;
  metrics: { completedMaintenance: number; attemptCount: number; nonMaintenanceVisitCount: number; prospectVisitCount: number; currentOpen: number; overdueOpen: number; helpedMaintenance: number; helpedAttempts: number; receivedHelpMaintenance: number; receivedHelpAttempts: number };
  paperwork: { serviceSlip: PaperworkCounts; confirmation: PaperworkCounts };
  events: Array<{ id: string; type: 'MAINTENANCE' | 'ATTEMPT' | 'NON_MAINTENANCE_VISIT' | 'PROSPECT_VISIT'; at: string; point?: { name: string; code?: string } | null; prospect?: { name: string } | null; relation: 'OWN' | 'HELPED_OTHER' | 'RECEIVED_HELP'; technician?: { name: string } | null; serviceSlipStatus?: string | null; confirmationStatus?: string | null; reason?: string | null; purpose?: string | null }>;
};
type PaperworkCounts = { pending: number; present: number; missing: number; approved: number };

export function PaperworkSummaryTable({ paperwork }: { paperwork: Summary['paperwork'] }) {
  return <div className="tableWrap"><table><thead><tr><th scope="col">Evrak</th><th scope="col">Bekliyor</th><th scope="col">Var</th><th scope="col">Eksik</th><th scope="col">Onaylandı</th></tr></thead><tbody><tr><th scope="row"><strong>Servis fişi</strong></th><td>{paperwork.serviceSlip.pending}</td><td>{paperwork.serviceSlip.present}</td><td>{paperwork.serviceSlip.missing}</td><td>{paperwork.serviceSlip.approved}</td></tr><tr><th scope="row"><strong>Teyit</strong></th><td>{paperwork.confirmation.pending}</td><td>{paperwork.confirmation.present}</td><td>{paperwork.confirmation.missing}</td><td>{paperwork.confirmation.approved}</td></tr></tbody></table></div>;
}

function istanbulDateKey() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function eventType(type: Summary['events'][number]['type']) { return type === 'MAINTENANCE' ? 'Bakım' : type === 'ATTEMPT' ? 'Yapılamadı' : type === 'NON_MAINTENANCE_VISIT' ? 'Diğer ziyaret' : 'Prospect'; }

type SummaryCallbacks = { summary: (value: Summary | null) => void; error: (value: string) => void; loading: (value: boolean) => void };
type SummaryResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
type SummaryFetcher = (url: string, init?: RequestInit) => Promise<SummaryResponse>;

export function createTechnicianDailySummaryLoader(callbacks: SummaryCallbacks, request: SummaryFetcher = (url, init) => fetch(url, init)) {
  let cancelActive = () => {};
  return {
    load({ technicianId, date }: { technicianId: string; date: string }) {
      cancelActive();
      if (!technicianId || !date) { callbacks.summary(null); callbacks.loading(false); return; }
      let active = true;
      const controller = new AbortController();
      cancelActive = () => { active = false; controller.abort(); };
      callbacks.loading(true); callbacks.error(''); callbacks.summary(null);
      void request(`/api/backend/maintenance/admin-technician-daily-summary?technicianId=${encodeURIComponent(technicianId)}&date=${encodeURIComponent(date)}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
          if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
          if (active) callbacks.summary(body as Summary);
        })
        .catch((reason) => { if (active) callbacks.error(reason instanceof Error ? reason.message : String(reason)); })
        .finally(() => { if (active) callbacks.loading(false); });
    },
    cancel() { cancelActive(); },
  };
}

export default function TechnicianDailySummaryPanel({ users }: { users: Technician[] }) {
  const technicians = users.filter((user) => user.role === 'TECHNICIAN' && user.active);
  const [technicianId, setTechnicianId] = useState('');
  const [date, setDate] = useState(istanbulDateKey);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loaderRef = useRef<ReturnType<typeof createTechnicianDailySummaryLoader> | null>(null);
  useEffect(() => setTechnicianId((current) => current || technicians[0]?.id || ''), [technicians]);
  function load() {
    if (!loaderRef.current) loaderRef.current = createTechnicianDailySummaryLoader({ summary: setSummary, error: setError, loading: setLoading });
    loaderRef.current.load({ technicianId, date });
  }
  useEffect(() => { load(); return () => loaderRef.current?.cancel(); }, [technicianId, date]);
  return <section className="panel">
    <div className="panelHeader"><div><h2>Teknisyen Günlük Özeti</h2><p>Seçilen İstanbul iş günündeki gerçek saha hareketleri, yardım ilişkileri ve evrak durumu.</p></div><div className="rowActions"><select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} aria-label="Teknisyen seç"><option value="">Teknisyen seç</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select><input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Teknisyen özet tarihi" /><button className="ghost" onClick={() => void load()} disabled={loading || !technicianId}>{loading ? 'Yükleniyor' : 'Yenile'}</button></div></div>
    {error ? <div className="error" role="alert">{error}</div> : null}
    {summary ? <><p className="muted"><strong>{summary.technician.name}</strong> · {summary.date}</p><section className="dashboardGrid"><div className="dashboardCard"><span>Kendi bakımı</span><strong>{summary.metrics.completedMaintenance}</strong><small>Başka teknisyen adına yapılanlar hariç</small></div><div className="dashboardCard"><span>Yapılamadı / diğer / prospect</span><strong>{summary.metrics.attemptCount} / {summary.metrics.nonMaintenanceVisitCount} / {summary.metrics.prospectVisitCount}</strong><small>Kendi saha hareketleri</small></div><div className="dashboardCard"><span>Gün sonu açık / geciken</span><strong>{summary.metrics.currentOpen} / {summary.metrics.overdueOpen}</strong><small>Tarihsel görev snapshot</small></div><div className="dashboardCard"><span>Yardım verdi</span><strong>{summary.metrics.helpedMaintenance} / {summary.metrics.helpedAttempts}</strong><small>Bakım / yapılamadı</small></div><div className="dashboardCard"><span>Yardım aldı</span><strong>{summary.metrics.receivedHelpMaintenance} / {summary.metrics.receivedHelpAttempts}</strong><small>Başka teknisyenin onun adına yaptığı</small></div></section><PaperworkSummaryTable paperwork={summary.paperwork} /><div className="tableWrap"><table><thead><tr><th scope="col">Hareket</th><th scope="col">Tür</th><th scope="col">Nokta / müşteri</th><th scope="col">İlişki</th><th scope="col">Detay</th></tr></thead><tbody>{summary.events.length === 0 ? <tr><td colSpan={5}>Seçili günde saha hareketi yok.</td></tr> : summary.events.map((item) => <tr key={`${item.type}-${item.id}`}><th scope="row">{new Date(item.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</th><td>{eventType(item.type)}</td><td><strong>{item.point?.name || item.prospect?.name || '—'}</strong>{item.point?.code ? <div className="muted">{item.point.code}</div> : null}</td><td>{item.relation === 'HELPED_OTHER' ? 'Yardım verdi' : item.relation === 'RECEIVED_HELP' ? `Yardım aldı${item.technician?.name ? ` · ${item.technician.name}` : ''}` : 'Kendi işi'}</td><td className="muted">{item.type === 'MAINTENANCE' ? `Servis fişi: ${item.serviceSlipStatus ?? '—'} · Teyit: ${item.confirmationStatus ?? '—'}` : item.reason || item.purpose || '—'}</td></tr>)}</tbody></table></div></> : <div className="emptyState compact"><strong>{loading ? 'Teknisyen özeti hazırlanıyor' : 'Teknisyen seçin'}</strong><span>Seçilen tarihin gerçek saha verileri burada gösterilir.</span></div>}
  </section>;
}
