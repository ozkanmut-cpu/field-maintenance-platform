'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminIcon } from './admin-icons';
import { AdminFilterToolbar, AdminListState, AdminPanel } from './admin-primitives';
import { AccessibleTable } from './accessible-table';
import { LatestRequest, RequestActivity } from './latest-request.mjs';

type User = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type Region = { id: string; name: string };
type Point = { id: string; code: string; name: string; region?: Region | null };
type PaperworkStatus = 'PENDING' | 'PRESENT' | 'MISSING' | 'PENDING_REVIEW' | 'APPROVED';
type PaperworkKind = 'SERVICE_SLIP' | 'CONFIRMATION';
type PaperworkFilterStatus = 'PENDING' | 'ALL';
type MaintenanceItem = {
  type: string;
  id: string;
  at: string;
  performedAt?: string;
  totalCoolerCount?: number | null;
  maintainedCoolerCount?: number | null;
  confirmationCount?: number | null;
  serviceSlipStatus?: PaperworkStatus;
  confirmationStatus?: PaperworkStatus;
  confirmationApprovalSource?: 'AUTO_SAP' | 'MANUAL_ADMIN' | null;
  point?: { id: string; code: string; name: string; maintenanceType?: string };
  technicianId?: string;
  technicianName?: string;
  regionId?: string;
  regionName?: string;
};
type TechnicianHistory = { date: string; maintenanceCount: number; items: MaintenanceItem[] };
type PaperworkHistoryItem = {
  id: string; kind: PaperworkKind; previousStatus: PaperworkStatus; newStatus: PaperworkStatus;
  changedAt: string; note?: string | null; changedBy: { id: string; name: string } | null;
  provenance?: 'MANUAL_USER' | 'SAP_RECONCILIATION';
};
type RowAction = { kind: PaperworkKind; status: 'APPROVED' | 'MISSING'; note: string };
type RowError = { message: string; action: RowAction };

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

const PAPERWORK_FILTERS_KEY = 'fmp.admin.paperwork.filters.v1';
const statusLabel: Record<PaperworkStatus, string> = {
  PENDING: 'Bekliyor', PRESENT: 'Var', MISSING: 'Eksik', PENDING_REVIEW: 'İnceleme bekliyor', APPROVED: 'Onaylandı',
};

function istanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function defaultPaperworkRange() {
  const today = istanbulDateKey();
  const day = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const thisMonday = shiftDateKey(today, day === 0 ? -6 : 1 - day);
  return { from: shiftDateKey(thisMonday, -7), to: shiftDateKey(thisMonday, 6) };
}
function dateKeys(from: string, to: string) {
  if (!from || !to || from > to) return [];
  const result: string[] = [];
  for (let value = from; value <= to && result.length < 93; value = shiftDateKey(value, 1)) result.push(value);
  return result;
}
function formatMinutes(value: number | null) {
  if (value === null) return '—';
  if (value < 60) return `${value} dk`;
  if (value < 1440) return `${Math.floor(value / 60)} sa ${value % 60} dk`;
  return `${Math.floor(value / 1440)} gün ${Math.floor((value % 1440) / 60)} sa`;
}
function isUnresolved(status?: PaperworkStatus) {
  return status !== 'APPROVED';
}

export default function PaperworkManagement() {
  const initialRange = useMemo(defaultPaperworkRange, []);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [regionId, setRegionId] = useState('ALL');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<PaperworkFilterStatus>('PENDING');
  const [confirmationFilter, setConfirmationFilter] = useState<'ALL' | PaperworkStatus>('ALL');
  const [slipFilter, setSlipFilter] = useState<'ALL' | PaperworkStatus>('ALL');
  const [visits, setVisits] = useState<MaintenanceItem[]>([]);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState('');
  const [visitsBusy, setVisitsBusy] = useState(false);
  const [visitsError, setVisitsError] = useState('');
  const [visitsLoaded, setVisitsLoaded] = useState(false);
  const [mutationVisitId, setMutationVisitId] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<string, RowError>>({});
  const [notice, setNotice] = useState('');
  const [historyVisitId, setHistoryVisitId] = useState('');
  const [history, setHistory] = useState<PaperworkHistoryItem[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [analytics, setAnalytics] = useState<PaperworkAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const visitsRequests = useRef(new RequestActivity(setVisitsBusy));
  const historyRequests = useRef(new RequestActivity(setHistoryBusy));
  const analyticsRequests = useRef(new LatestRequest());
  const skipFirstPersistence = useRef(true);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function loadBase() {
    setBaseLoading(true);
    setBaseError('');
    try {
      const [users, pointList] = await Promise.all([api<User[]>('/api/backend/users'), api<Point[]>('/api/backend/points')]);
      const techs = users.filter((user) => user.role === 'TECHNICIAN' && user.active);
      setTechnicians(techs);
      setPoints(pointList);
      setTechnicianId((current) => current || techs[0]?.id || '');
    } catch (cause) {
      setBaseError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBaseLoading(false);
    }
  }

  function invalidateList() {
    visitsRequests.current.invalidate();
    historyRequests.current.invalidate();
    setVisits([]);
    setVisitsLoaded(false);
    setVisitsError('');
    setHistoryVisitId('');
    setHistory([]);
    setRowErrors({});
  }

  async function loadVisits() {
    const requestEpoch = visitsRequests.current.begin();
    setVisits([]);
    setVisitsLoaded(false);
    setVisitsError('');
    if (!technicianId || !from || !to || from > to) {
      setVisitsError(from > to ? 'Başlangıç tarihi bitiş tarihinden sonra olamaz.' : '');
      visitsRequests.current.finish(requestEpoch);
      return;
    }
    const selectedTechnicians = technicianId === 'ALL' ? technicians : technicians.filter((item) => item.id === technicianId);
    const pointMap = new Map(points.map((point) => [point.id, point]));
    try {
      const requests = selectedTechnicians.flatMap((technician) => dateKeys(from, to).map(async (date) => {
        const data = await api<TechnicianHistory>(`/api/backend/maintenance/technician-history?technicianId=${encodeURIComponent(technician.id)}&date=${encodeURIComponent(date)}`);
        return data.items.filter((item) => item.type === 'MAINTENANCE').map((item) => {
          const point = item.point ? pointMap.get(item.point.id) : undefined;
          return {
            ...item,
            technicianId: technician.id,
            technicianName: technician.name,
            regionId: point?.region?.id,
            regionName: point?.region?.name,
          };
        });
      }));
      const rows = (await Promise.all(requests)).flat();
      if (!visitsRequests.current.isCurrent(requestEpoch)) return;
      setVisits(Array.from(new Map(rows.map((row) => [row.id, row])).values()).sort((left, right) =>
        new Date(right.performedAt || right.at).getTime() - new Date(left.performedAt || left.at).getTime()));
      setVisitsLoaded(true);
    } catch (cause) {
      if (!visitsRequests.current.isCurrent(requestEpoch)) return;
      setVisitsError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      visitsRequests.current.finish(requestEpoch);
    }
  }

  async function loadAnalytics() {
    if (!from || !to || from > to) return;
    const requestEpoch = analyticsRequests.current.next();
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      const params = new URLSearchParams({ from, to });
      if (technicianId && technicianId !== 'ALL') params.set('technicianId', technicianId);
      const result = await api<PaperworkAnalytics>(`/api/backend/maintenance/paperwork-analytics?${params.toString()}`);
      if (analyticsRequests.current.isCurrent(requestEpoch)) setAnalytics(result);
    } catch (cause) {
      if (analyticsRequests.current.isCurrent(requestEpoch)) setAnalyticsError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (analyticsRequests.current.isCurrent(requestEpoch)) setAnalyticsLoading(false);
    }
  }

  useEffect(() => { void loadBase(); }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(PAPERWORK_FILTERS_KEY) || '{}') as Record<string, string>;
      if (saved.technicianId) setTechnicianId(saved.technicianId);
      if (saved.from) setFrom(saved.from);
      if (saved.to) setTo(saved.to);
      if (saved.regionId) setRegionId(saved.regionId);
      if (saved.search) setSearch(saved.search);
      if (saved.filterStatus === 'ALL' || saved.filterStatus === 'PENDING') setFilterStatus(saved.filterStatus);
      if (saved.confirmationFilter) setConfirmationFilter(saved.confirmationFilter as 'ALL' | PaperworkStatus);
      if (saved.slipFilter) setSlipFilter(saved.slipFilter as 'ALL' | PaperworkStatus);
    } catch {
      window.sessionStorage.removeItem(PAPERWORK_FILTERS_KEY);
    }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (skipFirstPersistence.current) { skipFirstPersistence.current = false; return; }
    window.sessionStorage.setItem(PAPERWORK_FILTERS_KEY, JSON.stringify({
      technicianId, from, to, regionId, search, filterStatus, confirmationFilter, slipFilter,
    }));
  }, [technicianId, from, to, regionId, search, filterStatus, confirmationFilter, slipFilter]);
  useEffect(() => {
    if (!baseLoading && !baseError && technicianId) void loadVisits();
  }, [baseLoading, baseError, technicianId, from, to, technicians, points]);
  useEffect(() => { void loadAnalytics(); }, [technicianId, from, to]);

  const regions = useMemo(() => Array.from(new Map(points.filter((point) => point.region).map((point) => [point.region!.id, point.region!.name])).entries())
    .sort((left, right) => left[1].localeCompare(right[1], 'tr')).map(([id, name]) => ({ id, name })), [points]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    return visits.filter((visit) => {
      const searchable = `${visit.point?.code ?? ''} ${visit.point?.name ?? ''} ${visit.technicianName ?? ''} ${visit.regionName ?? ''}`.toLocaleLowerCase('tr-TR');
      const unresolved = isUnresolved(visit.confirmationStatus) || isUnresolved(visit.serviceSlipStatus);
      return (!query || searchable.includes(query))
        && (regionId === 'ALL' || visit.regionId === regionId)
        && (filterStatus === 'ALL' || unresolved)
        && (confirmationFilter === 'ALL' || (visit.confirmationStatus || 'PENDING') === confirmationFilter)
        && (slipFilter === 'ALL' || (visit.serviceSlipStatus || 'PENDING') === slipFilter);
    });
  }, [visits, search, regionId, filterStatus, confirmationFilter, slipFilter]);

  async function updateOne(visitId: string, action: RowAction) {
    setMutationVisitId(visitId);
    setNotice('');
    setRowErrors((current) => { const next = { ...current }; delete next[visitId]; return next; });
    try {
      await api('/api/backend/maintenance/paperwork', {
        method: 'POST',
        body: JSON.stringify({ visitId, kind: action.kind, status: action.status, note: action.note }),
      });
      setVisits((current) => current.map((visit) => visit.id === visitId ? {
        ...visit,
        ...(action.kind === 'CONFIRMATION'
          ? { confirmationStatus: action.status, ...(action.status === 'APPROVED' ? { confirmationApprovalSource: 'MANUAL_ADMIN' as const } : {}) }
          : { serviceSlipStatus: action.status }),
      } : visit));
      setNotice('Kaydedildi.');
      if (historyVisitId === visitId) void openHistory(visitId);
    } catch (cause) {
      setRowErrors((current) => ({
        ...current,
        [visitId]: { message: cause instanceof Error ? cause.message : String(cause), action },
      }));
    } finally {
      setMutationVisitId('');
    }
  }

  async function openHistory(visitId: string) {
    const requestEpoch = historyRequests.current.begin();
    setHistoryVisitId(visitId);
    setHistory([]);
    setHistoryError('');
    try {
      const data = await api<PaperworkHistoryItem[]>(`/api/backend/maintenance/paperwork-history?visitId=${encodeURIComponent(visitId)}`);
      if (!historyRequests.current.isCurrent(requestEpoch)) return;
      setHistory(data);
    } catch (cause) {
      if (historyRequests.current.isCurrent(requestEpoch)) setHistoryError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      historyRequests.current.finish(requestEpoch);
    }
  }

  const pendingCount = visible.filter((visit) => isUnresolved(visit.confirmationStatus) || isUnresolved(visit.serviceSlipStatus)).length;
  const missingConfirmationCount = visible.filter((visit) => visit.confirmationStatus === 'MISSING').length;
  const missingSlipCount = visible.filter((visit) => visit.serviceSlipStatus === 'MISSING').length;
  const activeFilters = [
    ...(filterStatus === 'PENDING' ? [{ id: 'pending', label: 'Yalnız bekleyenler', onRemove: () => setFilterStatus('ALL') }] : []),
    ...(regionId !== 'ALL' ? [{ id: 'region', label: `Bölge: ${regions.find((item) => item.id === regionId)?.name || regionId}`, onRemove: () => setRegionId('ALL') }] : []),
    ...(confirmationFilter !== 'ALL' ? [{ id: 'confirmation', label: `Teyit: ${statusLabel[confirmationFilter]}`, onRemove: () => setConfirmationFilter('ALL') }] : []),
    ...(slipFilter !== 'ALL' ? [{ id: 'slip', label: `Fiş: ${statusLabel[slipFilter]}`, onRemove: () => setSlipFilter('ALL') }] : []),
  ];

  return <>
    <div className="panelHeader">
      <div><h1>Fiş ve Teyit Merkezi</h1><p>Bakım kayıtlarının teyit ve servis fişi durumlarını tek ekrandan yönetin.</p></div>
    </div>

    <section className="dashboardGrid" aria-label="Fiş ve teyit özeti">
      <div className="dashboardCard"><span>Bekleyen</span><strong>{pendingCount}</strong><small>Filtrelenen açık kayıtlar</small></div>
      <div className="dashboardCard"><span>Teyit Eksik</span><strong>{missingConfirmationCount}</strong><small>Teyit kararı gerekli</small></div>
      <div className="dashboardCard"><span>Fiş Yok</span><strong>{missingSlipCount}</strong><small>Servis fişi gerekli</small></div>
    </section>

    <AdminFilterToolbar resultCount={visible.length} resultLabel="kayıt" refreshing={visitsBusy}
      onRefresh={() => void loadVisits()} onClear={() => {
        const range = defaultPaperworkRange();
        invalidateList();
        setFrom(range.from); setTo(range.to); setRegionId('ALL'); setSearch('');
        setFilterStatus('PENDING'); setConfirmationFilter('ALL'); setSlipFilter('ALL');
      }} activeFilters={activeFilters}>
      <input type="date" aria-label="Evrak başlangıç tarihi" value={from} onChange={(event) => { invalidateList(); setFrom(event.target.value); }} />
      <input type="date" aria-label="Evrak bitiş tarihi" value={to} onChange={(event) => { invalidateList(); setTo(event.target.value); }} />
      <select aria-label="Evrak teknisyeni filtresi" value={technicianId} onChange={(event) => { invalidateList(); setTechnicianId(event.target.value); }}>
        <option value="ALL">Tüm teknisyenler</option>
        {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
      </select>
      <select aria-label="Evrak bölgesi filtresi" value={regionId} onChange={(event) => setRegionId(event.target.value)}>
        <option value="ALL">Tüm bölgeler</option>
        {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
      </select>
      <div className="searchField"><AdminIcon name="search" size={17} /><input aria-label="Müşteri ara" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nokta veya müşteri ara" /></div>
      <select aria-label="Kayıt durumu filtresi" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as PaperworkFilterStatus)}>
        <option value="PENDING">Yalnız bekleyenler</option><option value="ALL">Tüm kayıtlar</option>
      </select>
      <select aria-label="Teyit durumu filtresi" value={confirmationFilter} onChange={(event) => setConfirmationFilter(event.target.value as 'ALL' | PaperworkStatus)}>
        <option value="ALL">Tüm teyit durumları</option>{Object.entries(statusLabel).filter(([key]) => key !== 'PENDING_REVIEW').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select aria-label="Servis fişi durumu filtresi" value={slipFilter} onChange={(event) => setSlipFilter(event.target.value as 'ALL' | PaperworkStatus)}>
        <option value="ALL">Tüm fiş durumları</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </AdminFilterToolbar>

    {notice ? <div className="banner" role="status">{notice}</div> : null}
    {baseError ? <AdminListState state="error" title="Temel veriler alınamadı" description={baseError} onRetry={() => void loadBase()} /> : null}
    {visitsError ? <AdminListState state="error" title="Bakım kayıtları alınamadı" description={visitsError} onRetry={() => void loadVisits()} /> : null}

    <AdminPanel title="Bakım evrakları" titleId="paperwork-table-title" description="Her karar yalnız ilgili bakım kaydını günceller.">
      {baseLoading || visitsBusy ? <AdminListState state="loading" title="Bakım kayıtları yükleniyor" description="Seçili dönem hazırlanıyor." /> :
      !visitsLoaded ? <AdminListState state="empty" title="Kayıtlar hazırlanamadı" description="Filtreleri kontrol edip yeniden deneyin." /> :
      visible.length === 0 ? <AdminListState state="empty" title="Eşleşen kayıt yok" description="Seçili filtrelerle eşleşen bakım kaydı bulunamadı." /> :
      <AccessibleTable caption="Fiş ve teyit bakım kayıtları" stickyColumns={2}>
        <thead><tr><th>Nokta / Müşteri</th><th>Teknisyen</th><th>Bakım Tarihi</th><th>Teyit / Girilen Bakım / Soğutucu</th><th>Teyit</th><th>Servis Fişi</th><th>Geçmiş</th></tr></thead>
        <tbody>{visible.map((visit) => {
          const confirmationStatus = visit.confirmationStatus || 'PENDING';
          const slipStatus = visit.serviceSlipStatus || 'PENDING';
          const rowBusy = mutationVisitId === visit.id;
          const confirmationFinal = confirmationStatus === 'APPROVED' && visit.confirmationApprovalSource === 'MANUAL_ADMIN';
          return <tr key={visit.id}>
            <td><strong>{visit.point?.name || '—'}</strong><div className="muted">{visit.point?.code || '—'} · {visit.regionName || 'Bölge yok'}</div></td>
            <td>{visit.technicianName || '—'}</td>
            <td>{new Date(visit.performedAt || visit.at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</td>
            <td><strong>{visit.confirmationCount ?? '—'} / {visit.maintainedCoolerCount ?? '—'} / {visit.totalCoolerCount ?? '—'}</strong></td>
            <td>
              <div className="rowActions">
                <button className={confirmationStatus === 'APPROVED' ? 'small' : 'small ghost'} aria-pressed={confirmationStatus === 'APPROVED'} disabled={rowBusy || confirmationFinal} onClick={() => void updateOne(visit.id, { kind: 'CONFIRMATION', status: 'APPROVED', note: 'Teyit admin tarafından onaylandı.' })}>Teyit Onaylandı</button>
                <button className={confirmationStatus === 'MISSING' ? 'small danger' : 'small ghost'} aria-pressed={confirmationStatus === 'MISSING'} disabled={rowBusy || confirmationFinal} onClick={() => void updateOne(visit.id, { kind: 'CONFIRMATION', status: 'MISSING', note: 'Teyit yok.' })}>Teyit Yok</button>
                <button className="small ghost" aria-pressed={false} disabled={rowBusy || confirmationFinal} onClick={() => void updateOne(visit.id, { kind: 'CONFIRMATION', status: 'MISSING', note: 'Teyit eksik.' })}>Teyit Eksik</button>
                <span className="pill">{statusLabel[confirmationStatus]}{confirmationFinal ? ' · Manuel final' : ''}</span>
              </div>
              {rowErrors[visit.id] ? <div className="error banner" role="alert">{rowErrors[visit.id].message}<button className="small" disabled={rowBusy} onClick={() => void updateOne(visit.id, rowErrors[visit.id].action)}>Tekrar dene</button></div> : null}
            </td>
            <td><div className="rowActions">
              <button className={slipStatus === 'APPROVED' ? 'small' : 'small ghost'} aria-pressed={slipStatus === 'APPROVED'} disabled={rowBusy} onClick={() => void updateOne(visit.id, { kind: 'SERVICE_SLIP', status: 'APPROVED', note: 'Servis fişi var.' })}>Fiş Var</button>
              <button className={slipStatus === 'MISSING' ? 'small danger' : 'small ghost'} aria-pressed={slipStatus === 'MISSING'} disabled={rowBusy} onClick={() => void updateOne(visit.id, { kind: 'SERVICE_SLIP', status: 'MISSING', note: 'Servis fişi yok.' })}>Fiş Yok</button>
              <span className="pill">{statusLabel[slipStatus]}</span>
            </div></td>
            <td><button className="small ghost" disabled={rowBusy} onClick={() => void openHistory(visit.id)}>Detay</button></td>
          </tr>;
        })}</tbody>
      </AccessibleTable>}
    </AdminPanel>

    {historyVisitId ? <AdminPanel title="Evrak Değişiklik Geçmişi" titleId="paperwork-history-title"
      actions={<button className="ghost" onClick={() => { historyRequests.current.invalidate(); setHistoryVisitId(''); setHistory([]); }}><AdminIcon name="error" size={16} /> Kapat</button>}>
      {historyBusy ? <AdminListState state="loading" title="Geçmiş yükleniyor" /> :
      historyError ? <AdminListState state="error" title="Geçmiş alınamadı" description={historyError} onRetry={() => void openHistory(historyVisitId)} /> :
      history.length === 0 ? <AdminListState state="empty" title="Evrak değişikliği yok" description="Bu kayıt için audit geçmişi bulunmuyor." /> :
      <AccessibleTable caption="Evrak değişiklik geçmişi"><thead><tr><th>Tarih</th><th>Evrak</th><th>Önce</th><th>Sonra</th><th>Kullanıcı</th><th>Not</th></tr></thead><tbody>
        {history.map((item) => <tr key={item.id}><td>{new Date(item.changedAt).toLocaleString('tr-TR')}</td><td>{item.kind === 'SERVICE_SLIP' ? 'Servis Fişi' : 'Teyit'}</td><td>{statusLabel[item.previousStatus]}</td><td><strong>{statusLabel[item.newStatus]}</strong></td><td>{item.changedBy?.name ?? (item.provenance === 'SAP_RECONCILIATION' ? 'SAP (otomatik)' : 'Sistem')}</td><td>{item.note || '—'}</td></tr>)}
      </tbody></AccessibleTable>}
    </AdminPanel> : null}

    <details className="panel">
      <summary><strong>Evrak Tamamlanma Analitiği</strong></summary>
      <p>Seçili dönem ve teknisyen için belge geliş ve durum netleşme süreleri.</p>
      <button className="small ghost" disabled={analyticsLoading} onClick={() => void loadAnalytics()}>{analyticsLoading ? 'Yükleniyor…' : 'Analitiği yenile'}</button>
      {analyticsError ? <AdminListState state="error" title="Analitik alınamadı" description={analyticsError} onRetry={() => void loadAnalytics()} /> : null}
      {analytics ? <><section className="dashboardGrid">
        <div className="dashboardCard"><span>Analiz edilen bakım</span><strong>{analytics.totalVisits}</strong><small>{analytics.from} → {analytics.to}</small></div>
        <div className="dashboardCard"><span>Servis fişi · Belge geliş medyanı</span><strong>{formatMinutes(analytics.serviceSlip.arrival.medianMinutes)}</strong><small>P90: {formatMinutes(analytics.serviceSlip.arrival.p90Minutes)}</small></div>
        <div className="dashboardCard"><span>Teyit · Belge geliş medyanı</span><strong>{formatMinutes(analytics.confirmation.arrival.medianMinutes)}</strong><small>P90: {formatMinutes(analytics.confirmation.arrival.p90Minutes)}</small></div>
        <div className="dashboardCard"><span>Durum netleşme medyanı</span><strong>{formatMinutes(analytics.serviceSlip.resolution.medianMinutes)}</strong><small>Teyit: {formatMinutes(analytics.confirmation.resolution.medianMinutes)}</small></div>
      </section>
      <AccessibleTable caption="Evrak analitiği"><thead><tr><th>Evrak</th><th>Var</th><th>Onaylandı</th><th>Bekliyor</th><th>Eksik</th><th>Belge geliş medyanı / P90</th><th>Durum netleşme medyanı / P90</th></tr></thead><tbody>
        {([['Servis Fişi', analytics.serviceSlip], ['Teyit', analytics.confirmation]] as const).map(([label, item]) => <tr key={label}><td><strong>{label}</strong></td><td>{item.statusCounts.present} ({item.statusRates.present}%)</td><td>{item.statusCounts.approved} ({item.statusRates.approved}%)</td><td>{item.statusCounts.pending} ({item.statusRates.pending}%)</td><td>{item.statusCounts.missing} ({item.statusRates.missing}%)</td><td>{formatMinutes(item.arrival.medianMinutes)} / {formatMinutes(item.arrival.p90Minutes)}</td><td>{formatMinutes(item.resolution.medianMinutes)} / {formatMinutes(item.resolution.p90Minutes)}</td></tr>)}
      </tbody></AccessibleTable>
      <AccessibleTable caption="Bekleyen evrak yaşı"><thead><tr><th>Bekleyen evrak yaşı</th><th>0–24 saat</th><th>24–48 saat</th><th>2–7 gün</th><th>7+ gün</th></tr></thead><tbody>
        <tr><td>Servis Fişi</td><td>{analytics.serviceSlip.pendingAgeBuckets.under24h}</td><td>{analytics.serviceSlip.pendingAgeBuckets.h24to48}</td><td>{analytics.serviceSlip.pendingAgeBuckets.d2to7}</td><td>{analytics.serviceSlip.pendingAgeBuckets.d7plus}</td></tr>
        <tr><td>Teyit</td><td>{analytics.confirmation.pendingAgeBuckets.under24h}</td><td>{analytics.confirmation.pendingAgeBuckets.h24to48}</td><td>{analytics.confirmation.pendingAgeBuckets.d2to7}</td><td>{analytics.confirmation.pendingAgeBuckets.d7plus}</td></tr>
      </tbody></AccessibleTable></> : null}
    </details>
  </>;
}
