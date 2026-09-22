'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';
import { bulkPaperworkStatusOptions, paperworkStatusOptions } from './paperwork-status-policy.mjs';

type User = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type PaperworkStatus = 'PENDING' | 'PRESENT' | 'MISSING' | 'PENDING_REVIEW' | 'APPROVED';
type PaperworkKind = 'SERVICE_SLIP' | 'CONFIRMATION';
type MaintenanceItem = {
  type: string; id: string; at: string; performedAt?: string; serviceSlipStatus?: PaperworkStatus; confirmationStatus?: PaperworkStatus;
  point?: { id: string; code: string; name: string; maintenanceType?: string };
};
type TechnicianHistory = { date: string; maintenanceCount: number; items: MaintenanceItem[] };
type PaperworkHistoryItem = {
  id: string; kind: PaperworkKind; previousStatus: PaperworkStatus; newStatus: PaperworkStatus;
  changedAt: string; note?: string | null; changedBy: { id: string; name: string } | null;
  provenance?: 'MANUAL_USER' | 'SAP_RECONCILIATION';
};

type PaperworkAnalyticsKind = {
  statusCounts: { pending: number; present: number; missing: number; approved: number };
  statusRates: { pending: number; present: number; missing: number; approved: number };
  arrival: { completedCount: number; medianMinutes: number | null; p90Minutes: number | null };
  resolution: { resolvedCount: number; medianMinutes: number | null; p90Minutes: number | null };
  pendingAgeBuckets: { under24h: number; h24to48: number; d2to7: number; d7plus: number };
};
type PaperworkAnalytics = {
  from: string; to: string; technicianId: string | null; generatedAt: string; totalVisits: number;
  serviceSlip: PaperworkAnalyticsKind; confirmation: PaperworkAnalyticsKind;
};

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
function formatMinutes(value: number | null) {
  if (value === null) return '—';
  if (value < 60) return `${value} dk`;
  if (value < 1440) return `${Math.floor(value / 60)} sa ${value % 60} dk`;
  return `${Math.floor(value / 1440)} gün ${Math.floor((value % 1440) / 60)} sa`;
}

const statusLabel: Record<PaperworkStatus, string> = { PENDING: 'Bekliyor', PRESENT: 'Var', MISSING: 'Eksik', PENDING_REVIEW: 'İnceleme bekliyor', APPROVED: 'Onaylandı' };

export default function PaperworkManagement() {
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visits, setVisits] = useState<MaintenanceItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkKind, setBulkKind] = useState<PaperworkKind>('SERVICE_SLIP');
  const [bulkStatus, setBulkStatus] = useState<PaperworkStatus>('PRESENT');
  const [bulkNote, setBulkNote] = useState('');
  const [historyVisitId, setHistoryVisitId] = useState('');
  const [history, setHistory] = useState<PaperworkHistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const analyticsToday = istanbulDateKey();
  const [analytics, setAnalytics] = useState<PaperworkAnalytics | null>(null);
  const [analyticsTechnicianId, setAnalyticsTechnicianId] = useState('');
  const [analyticsFrom, setAnalyticsFrom] = useState(() => shiftDateKey(analyticsToday, -29));
  const [analyticsTo, setAnalyticsTo] = useState(analyticsToday);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function loadTechnicians() {
    const users = await api<User[]>('/api/backend/users');
    const techs = users.filter((u) => u.role === 'TECHNICIAN' && u.active);
    setTechnicians(techs);
    setTechnicianId((current) => current || techs[0]?.id || '');
  }

  async function loadVisits() {
    if (!technicianId || !date) { setVisits([]); return; }
    setBusy(true); setLoading(true); setError('');
    try {
      const data = await api<TechnicianHistory>(`/api/backend/maintenance/technician-history?technicianId=${encodeURIComponent(technicianId)}&date=${encodeURIComponent(date)}`);
      setVisits(data.items.filter((item) => item.type === 'MAINTENANCE'));
      setSelected([]); setHistoryVisitId(''); setHistory([]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); setLoading(false); }
  }

  async function loadAnalytics() {
    if (!analyticsFrom || !analyticsTo) return;
    setAnalytics(null);
    setAnalyticsLoading(true); setError('');
    try {
      const params = new URLSearchParams({ from: analyticsFrom, to: analyticsTo });
      if (analyticsTechnicianId) params.set('technicianId', analyticsTechnicianId);
      setAnalytics(await api<PaperworkAnalytics>(`/api/backend/maintenance/paperwork-analytics?${params.toString()}`));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setAnalyticsLoading(false); }
  }

  useEffect(() => { void loadTechnicians().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { void loadVisits(); }, [technicianId, date]);
  useEffect(() => { void loadAnalytics(); }, [analyticsTechnicianId, analyticsFrom, analyticsTo]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return visits;
    return visits.filter((v) => `${v.point?.code ?? ''} ${v.point?.name ?? ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [visits, search]);
  const actionableSelected = selected.filter((id) => visible.some((visit) => visit.id === id));
  const bulkStatusOptions = bulkPaperworkStatusOptions(
    bulkKind,
    actionableSelected.flatMap((id) => {
      const visit = visible.find((item) => item.id === id);
      const status = bulkKind === 'SERVICE_SLIP' ? visit?.serviceSlipStatus : visit?.confirmationStatus;
      return status ? [status] : [];
    }),
  );
  const effectiveBulkStatus = bulkStatusOptions.some((option) => option.value === bulkStatus)
    ? bulkStatus
    : bulkStatusOptions[0].value;

  function toggle(id: string) { setSelected((items) => items.includes(id) ? items.filter((x) => x !== id) : [...items, id]); }
  function toggleAll() {
    const ids = visible.map((v) => v.id);
    setSelected(ids.every((id) => selected.includes(id)) ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]);
  }

  async function updateOne(visitId: string, kind: PaperworkKind, status: PaperworkStatus) {
    const note = window.prompt('Not (opsiyonel):')?.trim();
    if (note === undefined) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/backend/maintenance/paperwork', { method: 'POST', body: JSON.stringify({ visitId, kind, status, ...(note ? { note } : {}) }) });
      setNotice('Evrak durumu güncellendi.');
      await loadVisits();
      if (historyVisitId === visitId) await openHistory(visitId);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function bulkUpdate() {
    if (!actionableSelected.length) { setError('Toplu işlem için en az bir görünür bakım seç.'); return; }
    if (!window.confirm(`${actionableSelected.length} bakım kaydında ${bulkKind === 'SERVICE_SLIP' ? 'Servis Fişi' : 'Teyit'} durumu ${statusLabel[effectiveBulkStatus]} yapılsın mı?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/backend/maintenance/paperwork/bulk', {
        method: 'POST',
        body: JSON.stringify({ items: actionableSelected.map((visitId) => ({ visitId, kind: bulkKind, status: effectiveBulkStatus, ...(bulkNote.trim() ? { note: bulkNote.trim() } : {}) })) }),
      });
      setNotice(`${actionableSelected.length} bakım kaydının evrak durumu güncellendi.`);
      setBulkNote(''); await loadVisits();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function openHistory(visitId: string) {
    setBusy(true); setError('');
    try {
      const data = await api<PaperworkHistoryItem[]>(`/api/backend/maintenance/paperwork-history?visitId=${encodeURIComponent(visitId)}`);
      setHistoryVisitId(visitId); setHistory(data);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const pendingReviewSlip = visits.filter((v) => v.serviceSlipStatus === 'PENDING_REVIEW').length;
  const pendingSlip = visits.filter((v) => v.serviceSlipStatus === 'PENDING' || v.serviceSlipStatus === 'PENDING_REVIEW').length;
  const missingSlip = visits.filter((v) => v.serviceSlipStatus === 'MISSING').length;
  const pendingConfirmation = visits.filter((v) => v.confirmationStatus === 'PENDING').length;
  const missingConfirmation = visits.filter((v) => v.confirmationStatus === 'MISSING').length;

  return <>
    <section className="dashboardGrid">
      <div className="dashboardCard"><span>Bakım</span><strong>{visits.length}</strong><small>{date}</small></div>
      <div className="dashboardCard"><span>Servis fişi bekleyen</span><strong>{pendingSlip}</strong><small>Eksik: {missingSlip} · İnceleme: {pendingReviewSlip}</small></div>
      <div className="dashboardCard"><span>Teyit bekleyen</span><strong>{pendingConfirmation}</strong><small>Eksik: {missingConfirmation}</small></div>
      <div className="dashboardCard"><span>Seçili</span><strong>{actionableSelected.length}</strong><small>Toplu işlem için</small></div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Evrak Yönetimi</h2><p>Teknisyen ve güne göre bakım kayıtlarını getir; servis fişi ve teyit durumlarını yönet.</p></div><button className="ghost iconAction" disabled={busy} onClick={() => void loadVisits()}><AdminIcon name="refresh" size={17} /><span>YENİLE</span></button></div>
      {error ? <div className="error banner">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="compactForm">
        <select value={technicianId} onChange={(e) => { setSelected([]); setTechnicianId(e.target.value); }}>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name} (@{t.username})</option>)}</select>
        <input type="date" value={date} onChange={(e) => { setSelected([]); setDate(e.target.value); }} />
        <input value={search} onChange={(e) => { setSelected([]); setSearch(e.target.value); }} placeholder="Müşteri no / nokta ara" />
      </div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Evrak Tamamlanma Analitiği</h2><p>Bakımın sisteme kaydedildiği andan itibaren evrak geliş ve durum netleşme sürelerini izle.</p></div><button className="ghost iconAction" disabled={analyticsLoading} onClick={() => void loadAnalytics()}><AdminIcon name="refresh" size={17} /><span>{analyticsLoading ? 'YÜKLENİYOR' : 'YENİLE'}</span></button></div>
      <div className="compactForm">
        <select value={analyticsTechnicianId} onChange={(e) => setAnalyticsTechnicianId(e.target.value)}><option value="">Tüm teknisyenler</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name} (@{t.username})</option>)}</select>
        <input type="date" value={analyticsFrom} onChange={(e) => setAnalyticsFrom(e.target.value)} aria-label="Analitik başlangıç tarihi" />
        <input type="date" value={analyticsTo} onChange={(e) => setAnalyticsTo(e.target.value)} aria-label="Analitik bitiş tarihi" />
      </div>
      {analytics ? <>
        <section className="dashboardGrid">
          <div className="dashboardCard"><span>Analiz edilen bakım</span><strong>{analytics.totalVisits}</strong><small>{analytics.from} → {analytics.to}</small></div>
          <div className="dashboardCard"><span>Servis fişi · Belge geliş medyanı</span><strong>{formatMinutes(analytics.serviceSlip.arrival.medianMinutes)}</strong><small>P90: {formatMinutes(analytics.serviceSlip.arrival.p90Minutes)} · {analytics.serviceSlip.arrival.completedCount} kayıt</small></div>
          <div className="dashboardCard"><span>Teyit · Belge geliş medyanı</span><strong>{formatMinutes(analytics.confirmation.arrival.medianMinutes)}</strong><small>P90: {formatMinutes(analytics.confirmation.arrival.p90Minutes)} · {analytics.confirmation.arrival.completedCount} kayıt</small></div>
          <div className="dashboardCard"><span>Durum netleşme medyanı</span><strong>{formatMinutes(analytics.serviceSlip.resolution.medianMinutes)}</strong><small>Servis fişi · Teyit: {formatMinutes(analytics.confirmation.resolution.medianMinutes)}</small></div>
        </section>
        <div className="tableWrap"><table><thead><tr><th>Evrak</th><th>Var</th><th>Onaylandı</th><th>Bekliyor</th><th>Eksik</th><th>Belge geliş medyanı / P90</th><th>Durum netleşme medyanı / P90</th></tr></thead><tbody>
          {([['Servis Fişi', analytics.serviceSlip], ['Teyit', analytics.confirmation]] as const).map(([label, item]) => <tr key={label}><td><strong>{label}</strong></td><td>{item.statusCounts.present} ({item.statusRates.present}%)</td><td>{item.statusCounts.approved} ({item.statusRates.approved}%)</td><td>{item.statusCounts.pending} ({item.statusRates.pending}%)</td><td>{item.statusCounts.missing} ({item.statusRates.missing}%)</td><td>{formatMinutes(item.arrival.medianMinutes)} / {formatMinutes(item.arrival.p90Minutes)}</td><td>{formatMinutes(item.resolution.medianMinutes)} / {formatMinutes(item.resolution.p90Minutes)}</td></tr>)}
        </tbody></table></div>
        <div className="tableWrap"><table><thead><tr><th>Bekleyen evrak yaşı</th><th>0–24 saat</th><th>24–48 saat</th><th>2–7 gün</th><th>7+ gün</th></tr></thead><tbody>
          <tr><td><strong>Servis Fişi</strong></td><td>{analytics.serviceSlip.pendingAgeBuckets.under24h}</td><td>{analytics.serviceSlip.pendingAgeBuckets.h24to48}</td><td>{analytics.serviceSlip.pendingAgeBuckets.d2to7}</td><td>{analytics.serviceSlip.pendingAgeBuckets.d7plus}</td></tr>
          <tr><td><strong>Teyit</strong></td><td>{analytics.confirmation.pendingAgeBuckets.under24h}</td><td>{analytics.confirmation.pendingAgeBuckets.h24to48}</td><td>{analytics.confirmation.pendingAgeBuckets.d2to7}</td><td>{analytics.confirmation.pendingAgeBuckets.d7plus}</td></tr>
        </tbody></table></div>
      </> : <div className="emptyState compact"><AdminIcon name="clock" /><strong>Analitik hazırlanıyor</strong><span>Seçili dönem için evrak süreleri hesaplanıyor.</span></div>}
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Toplu Evrak İşlemi</h2><p>Seçili bakım kayıtlarına tek seferde aynı evrak durumunu uygula.</p></div></div>
      <div className="compactForm">
        <select value={bulkKind} onChange={(e) => setBulkKind(e.target.value as PaperworkKind)}><option value="SERVICE_SLIP">Servis Fişi</option><option value="CONFIRMATION">Teyit</option></select>
        <select value={effectiveBulkStatus} onChange={(e) => setBulkStatus(e.target.value as PaperworkStatus)}>{bulkStatusOptions.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select>
        <input value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} maxLength={250} placeholder="Toplu işlem notu (opsiyonel)" />
        <button disabled={busy || !actionableSelected.length} onClick={() => void bulkUpdate()}>SEÇİLİLERİ GÜNCELLE</button>
      </div>
    </section>

    <section className="panel">
      <div className="tableWrap"><table><thead><tr><th><input type="checkbox" checked={visible.length > 0 && visible.every((v) => selected.includes(v.id))} onChange={toggleAll} /></th><th>Saat</th><th>Nokta</th><th>Servis Fişi</th><th>Teyit</th><th></th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Bakım kayıtları yükleniyor</strong><span>Seçili teknisyen ve güne ait evraklar hazırlanıyor.</span></div></td></tr> : visible.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="search" /><strong>Bakım kaydı yok</strong><span>Seçili teknisyen, tarih veya arama için kayıt bulunamadı.</span></div></td></tr> : visible.map((visit) => <tr key={visit.id}>
          <td><input type="checkbox" checked={selected.includes(visit.id)} onChange={() => toggle(visit.id)} /></td>
          <td>{new Date(visit.performedAt || visit.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td><strong>{visit.point?.name || '—'}</strong><div className="muted">{visit.point?.code || '—'}</div></td>
          <td><select value={visit.serviceSlipStatus || 'PENDING'} disabled={busy} onChange={(e) => void updateOne(visit.id, 'SERVICE_SLIP', e.target.value as PaperworkStatus)}>{paperworkStatusOptions('SERVICE_SLIP', visit.serviceSlipStatus || 'PENDING').map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></td>
          <td><select value={visit.confirmationStatus || 'PENDING'} disabled={busy} onChange={(e) => void updateOne(visit.id, 'CONFIRMATION', e.target.value as PaperworkStatus)}>{paperworkStatusOptions('CONFIRMATION', visit.confirmationStatus || 'PENDING').map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></td>
          <td><button className="small" disabled={busy} onClick={() => void openHistory(visit.id)}>GEÇMİŞ</button></td>
        </tr>)}
      </tbody></table></div>
    </section>

    {historyVisitId ? <section className="panel"><div className="panelHeader"><div><h2>Evrak Değişiklik Geçmişi</h2><p>Ziyaret: {historyVisitId}</p></div><button className="ghost" onClick={() => { setHistoryVisitId(''); setHistory([]); }}><AdminIcon name="error" size={16} /><span>KAPAT</span></button></div>
      <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>Evrak</th><th>Önce</th><th>Sonra</th><th>Kullanıcı</th><th>Not</th></tr></thead><tbody>
        {history.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="history" /><strong>Evrak değişikliği yok</strong><span>Bu ziyaret için evrak audit kaydı bulunmuyor.</span></div></td></tr> : history.map((h) => <tr key={h.id}><td>{new Date(h.changedAt).toLocaleString('tr-TR')}</td><td>{h.kind === 'SERVICE_SLIP' ? 'Servis Fişi' : 'Teyit'}</td><td>{statusLabel[h.previousStatus]}</td><td><strong>{statusLabel[h.newStatus]}</strong></td><td>{h.changedBy?.name ?? (h.provenance === 'SAP_RECONCILIATION' ? 'SAP (otomatik)' : 'Sistem')}</td><td>{h.note || '—'}</td></tr>)}
      </tbody></table></div>
    </section> : null}
  </>;
}
