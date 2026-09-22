'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AdminIcon } from './admin-icons';
import { AdminFilterToolbar } from './admin-primitives';

type Technician = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type Point = { id: string; code: string; name: string; region?: { id: string; name: string; technicianId?: string | null } | null };
type Assignment = {
  id: string; pointId: string; technicianId: string; kind: 'POINT_OVERRIDE' | 'TEMPORARY'; startsAt: string; endsAt?: string | null;
  active: boolean; reason?: string | null; createdAt: string; deactivatedAt?: string | null;
  technician: { id: string; name: string; active: boolean }; createdBy: { id: string; name: string };
};
type PointHistory = { point: Point; assignments: Assignment[] };
type Effective = {
  pointId: string; source: 'REGION' | 'POINT_OVERRIDE' | 'TEMPORARY'; technicianId?: string | null;
  technician?: { id: string; name: string; active: boolean } | null; assignmentId?: string | null;
  startsAt?: string | null; endsAt?: string | null;
};
type AuditHistory = {
  assignment: { id: string; pointId: string; kind: string; active: boolean };
  history: Array<{ id: string; action: string; note?: string | null; oldValue?: unknown; newValue?: unknown; createdAt: string; actor: { id: string; name: string } }>;
};

type AssignmentTiming = 'PLANNED' | 'CURRENT' | 'EXPIRED' | 'CLOSED';

export function assignmentTimingStatus(
  assignment: Pick<Assignment, 'active' | 'startsAt' | 'endsAt'>,
  now: Date = new Date(),
): AssignmentTiming {
  if (!assignment.active) return 'CLOSED';
  if (new Date(assignment.startsAt) > now) return 'PLANNED';
  if (assignment.endsAt && new Date(assignment.endsAt) <= now) return 'EXPIRED';
  return 'CURRENT';
}

function assignmentTimingLabel(status: AssignmentTiming) {
  return ({ PLANNED: 'PLANLI', CURRENT: 'AKTİF', EXPIRED: 'SÜRESİ DOLDU', CLOSED: 'KAPALI' } as const)[status];
}

export function isAssignmentBusy(loading: { point: boolean; mutation: boolean; audit: boolean }) {
  return loading.point || loading.mutation || loading.audit;
}

export function filterAssignments(
  assignments: Assignment[],
  filters: { status: 'ALL' | 'ACTIVE' | 'CLOSED' | 'POINT_OVERRIDE' | 'TEMPORARY'; search: string },
  now: Date = new Date(),
) {
  const q = filters.search.trim().toLocaleLowerCase('tr-TR');
  return assignments.filter((assignment) => {
    const timing = assignmentTimingStatus(assignment, now);
    if (filters.status === 'ACTIVE' && timing !== 'CURRENT') return false;
    if (filters.status === 'CLOSED' && timing !== 'CLOSED' && timing !== 'EXPIRED') return false;
    if (filters.status === 'POINT_OVERRIDE' && assignment.kind !== 'POINT_OVERRIDE') return false;
    if (filters.status === 'TEMPORARY' && assignment.kind !== 'TEMPORARY') return false;
    return !q || `${assignment.technician.name} ${assignment.kind} ${assignment.reason ?? ''} ${assignment.createdBy.name}`.toLocaleLowerCase('tr-TR').includes(q);
  });
}

type AssignmentTimingRefreshScheduler = {
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export function startAssignmentTimingRefresh(
  assignments: Array<Pick<Assignment, 'active' | 'startsAt' | 'endsAt'>>,
  now: Date,
  refreshEffective: () => void,
  scheduler: AssignmentTimingRefreshScheduler = {
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  },
) {
  const nextBoundary = assignments.reduce<Date | null>((nearest, assignment) => {
    if (!assignment.active) return nearest;
    const candidates = [assignment.startsAt, assignment.endsAt]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((value) => value > now);
    const boundary = candidates.reduce<Date | null>((next, value) => !next || value < next ? value : next, null);
    return !boundary || nearest && nearest <= boundary ? nearest : boundary;
  }, null);
  if (!nextBoundary) return () => {};
  const handle = scheduler.setTimeout(refreshEffective, nextBoundary.getTime() - now.getTime());
  return () => scheduler.clearTimeout(handle);
}

type PointRequestHandlers = {
  history: (value: PointHistory | null) => void;
  effective: (value: Effective | null) => void;
  audit: (value: AuditHistory | null) => void;
  error: (value: string) => void;
  loading: (value: boolean) => void;
};

type AuditRequestHandlers = {
  audit: (value: AuditHistory | null) => void;
  error: (value: string) => void;
  loading: (value: boolean) => void;
};

type EffectiveRequestHandlers = {
  effective: (value: Effective) => void;
  error: (value: string) => void;
  loading: (value: boolean) => void;
};

export function startAssignmentPointRequest(
  pointId: string,
  handlers: PointRequestHandlers,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  let cancelled = false;
  handlers.history(null);
  handlers.effective(null);
  handlers.audit(null);
  handlers.error('');
  handlers.loading(true);
  void (async () => {
    try {
      const [historyResponse, effectiveResponse] = await Promise.all([
        fetcher(`/api/backend/assignments/point/${pointId}`, { signal: controller.signal }),
        fetcher(`/api/backend/assignments/effective/${pointId}`, { signal: controller.signal }),
      ]);
      const [pointHistory, effective] = await Promise.all([
        historyResponse.json().catch(() => null),
        effectiveResponse.json().catch(() => null),
      ]);
      if (!historyResponse.ok) throw new Error(Array.isArray(pointHistory?.message) ? pointHistory.message.join(', ') : pointHistory?.message || `HTTP ${historyResponse.status}`);
      if (!effectiveResponse.ok) throw new Error(Array.isArray(effective?.message) ? effective.message.join(', ') : effective?.message || `HTTP ${effectiveResponse.status}`);
      if (cancelled) return;
      handlers.history(pointHistory as PointHistory);
      handlers.effective(effective as Effective);
    } catch (e) {
      if (!cancelled) handlers.error(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelled) handlers.loading(false);
    }
  })();
  return () => {
    cancelled = true;
    controller.abort();
  };
}

export function startAssignmentAuditRequest(
  assignmentId: string,
  handlers: AuditRequestHandlers,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  let cancelled = false;
  handlers.audit(null);
  handlers.error('');
  handlers.loading(true);
  void (async () => {
    try {
      const response = await fetcher(`/api/backend/assignments/${assignmentId}/audit-history`, { signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
      if (!cancelled) handlers.audit(body as AuditHistory);
    } catch (e) {
      if (!cancelled) handlers.error(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelled) handlers.loading(false);
    }
  })();
  return () => {
    cancelled = true;
    controller.abort();
  };
}

export function startAssignmentEffectiveRequest(
  pointId: string,
  handlers: EffectiveRequestHandlers,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  let cancelled = false;
  handlers.error('');
  handlers.loading(true);
  void (async () => {
    try {
      const response = await fetcher(`/api/backend/assignments/effective/${pointId}`, { signal: controller.signal });
      const effective = await response.json().catch(() => null);
      if (!response.ok) throw new Error(Array.isArray(effective?.message) ? effective.message.join(', ') : effective?.message || `HTTP ${response.status}`);
      if (!cancelled) handlers.effective(effective as Effective);
    } catch (e) {
      if (!cancelled) handlers.error(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelled) handlers.loading(false);
    }
  })();
  return () => {
    cancelled = true;
    controller.abort();
  };
}

export default function AssignmentManagement() {
  const [points, setPoints] = useState<Point[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [pointId, setPointId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [kind, setKind] = useState<'POINT_OVERRIDE' | 'TEMPORARY'>('POINT_OVERRIDE');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState<PointHistory | null>(null);
  const [effective, setEffective] = useState<Effective | null>(null);
  const [audit, setAudit] = useState<AuditHistory | null>(null);
  const [search, setSearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'ACTIVE' | 'CLOSED' | 'POINT_OVERRIDE' | 'TEMPORARY'>('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [pointLoading, setPointLoading] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState('');
  const [pointError, setPointError] = useState('');
  const [auditError, setAuditError] = useState('');
  const [auditId, setAuditId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const cancelPointRequest = useRef<(() => void) | null>(null);
  const cancelAuditRequest = useRef<(() => void) | null>(null);
  const cancelEffectiveRequest = useRef<(() => void) | null>(null);
  const [now, setNow] = useState(() => new Date());
  const busy = baseLoading || isAssignmentBusy({ point: pointLoading, mutation: mutationBusy, audit: auditLoading });

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function loadBase() {
    setBaseLoading(true); setBaseError('');
    try {
      const [pointList, userList] = await Promise.all([api<Point[]>('/api/backend/points'), api<Technician[]>('/api/backend/users')]);
      setPoints(pointList);
      const techs = userList.filter((u) => u.role === 'TECHNICIAN' && u.active);
      setTechnicians(techs);
      setPointId((current) => current || pointList[0]?.id || '');
      setTechnicianId((current) => current || techs[0]?.id || '');
    } catch (cause) { setBaseError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBaseLoading(false); }
  }

  function loadPoint(id: string) {
    cancelPointRequest.current?.();
    cancelAuditRequest.current?.();
    cancelEffectiveRequest.current?.();
    cancelAuditRequest.current = null;
    cancelEffectiveRequest.current = null;
    setAuditLoading(false); setAuditId(''); setAuditError(''); setPointError('');
    if (!id) { setHistory(null); setEffective(null); setAudit(null); setPointLoading(false); return; }
    cancelPointRequest.current = startAssignmentPointRequest(id, {
      history: setHistory,
      effective: setEffective,
      audit: setAudit,
      error: setPointError,
      loading: setPointLoading,
    });
  }

  useEffect(() => { void loadBase(); }, []);
  useEffect(() => {
    loadPoint(pointId);
    return () => {
      cancelPointRequest.current?.();
      cancelPointRequest.current = null;
      cancelAuditRequest.current?.();
      cancelAuditRequest.current = null;
      cancelEffectiveRequest.current?.();
      cancelEffectiveRequest.current = null;
    };
  }, [pointId]);
  function refreshEffective(id: string) {
    cancelEffectiveRequest.current?.();
    cancelEffectiveRequest.current = startAssignmentEffectiveRequest(id, {
      effective: setEffective,
      error: setPointError,
      loading: setPointLoading,
    });
  }
  useEffect(() => {
    if (!pointId || !history) return;
    return startAssignmentTimingRefresh(history.assignments, now, () => {
      setNow(new Date());
      refreshEffective(pointId);
    });
  }, [history, now, pointId]);

  const filteredPoints = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return points;
    return points.filter((p) => `${p.code} ${p.name} ${p.region?.name ?? ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [points, search]);

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    if (!pointId || !technicianId || !startsAt) { setError('Nokta, teknisyen ve başlangıç tarihi zorunludur.'); return; }
    const startDate = new Date(startsAt);
    const endDate = endsAt ? new Date(endsAt) : null;
    if (Number.isNaN(startDate.getTime())) { setError('Başlangıç tarihi geçersiz.'); return; }
    if (kind === 'TEMPORARY' && !endDate) { setError('Geçici görevlendirmede bitiş tarihi zorunludur.'); return; }
    if (endDate && endDate <= startDate) { setError('Bitiş tarihi başlangıç tarihinden sonra olmalıdır.'); return; }
    const conflictingActive = history?.assignments.find((a) => a.active && (!a.endsAt || new Date(a.endsAt) > startDate));
    if (conflictingActive && !window.confirm(`Bu noktada halen aktif bir ${conflictingActive.kind === 'POINT_OVERRIDE' ? 'kalıcı override' : 'geçici görevlendirme'} var (${conflictingActive.technician.name}). Yeni kaydı yine de oluşturmak istiyor musunuz?`)) return;
    setMutationBusy(true); setError(''); setNotice('');
    try {
      await api('/api/backend/assignments', {
        method: 'POST',
        body: JSON.stringify({ pointId, technicianId, kind, startsAt: startDate.toISOString(), ...(endDate ? { endsAt: endDate.toISOString() } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      setNotice(kind === 'POINT_OVERRIDE' ? 'Kalıcı nokta istisnası oluşturuldu.' : 'Geçici görevlendirme oluşturuldu.');
      setReason(''); setEndsAt('');
      loadPoint(pointId);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setMutationBusy(false); }
  }

  async function deactivate(assignment: Assignment) {
    const closeReason = window.prompt('Görevlendirmeyi kapatma nedeni (opsiyonel):')?.trim();
    if (closeReason === undefined) return;
    if (!window.confirm(`${assignment.technician.name} görevlendirmesi kapatılsın mı?`)) return;
    setMutationBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/backend/assignments/${assignment.id}/deactivate`, { method: 'PATCH', body: JSON.stringify(closeReason ? { reason: closeReason } : {}) });
      setNotice('Görevlendirme kapatıldı.');
      loadPoint(pointId);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setMutationBusy(false); }
  }

  function openAudit(id: string) {
    cancelAuditRequest.current?.();
    setAuditId(id);
    cancelAuditRequest.current = startAssignmentAuditRequest(id, {
      audit: setAudit,
      error: setAuditError,
      loading: setAuditLoading,
    });
  }

  const activeCount = history?.assignments.filter((a) => assignmentTimingStatus(a, now) === 'CURRENT').length ?? 0;
  const overrideCount = history?.assignments.filter((a) => a.kind === 'POINT_OVERRIDE').length ?? 0;
  const temporaryCount = history?.assignments.filter((a) => a.kind === 'TEMPORARY').length ?? 0;
  const filteredHistory = useMemo(() => filterAssignments(history?.assignments ?? [], { status: historyFilter, search: historySearch }, now), [history, historyFilter, historySearch, now]);
  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    const saved = sessionStorage.getItem('admin.assignment.filters');
    if (!saved) return;
    try { const parsed = JSON.parse(saved); setHistoryFilter(parsed.status ?? 'ALL'); setHistorySearch(parsed.search ?? ''); } catch {}
  }, []);
  useEffect(() => { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('admin.assignment.filters', JSON.stringify({ status: historyFilter, search: historySearch })); }, [historyFilter, historySearch]);

  return <>
    {history && effective && !baseLoading && !baseError && !pointLoading && !pointError ? <section className="dashboardGrid">
      <div className="dashboardCard"><span>Effective kaynak</span><strong>{effective?.source ?? '—'}</strong><small>{effective?.technician?.name || 'Teknisyen yok'}</small></div>
      <div className="dashboardCard"><span>Yürürlükte istisna</span><strong>{activeCount}</strong><small>Bu nokta için</small></div>
      <div className="dashboardCard"><span>Kalıcı override</span><strong>{overrideCount}</strong><small>Toplam geçmiş</small></div>
      <div className="dashboardCard"><span>Geçici</span><strong>{temporaryCount}</strong><small>Toplam geçmiş</small></div>
    </section> : null}

    <section className="panel">
      <div className="panelHeader"><div><h2>Görevlendirme Yönetimi</h2><p>Bölge teknisyenini ezmeden nokta bazlı kalıcı istisna veya süreli görevlendirme tanımla.</p></div><button className="ghost iconAction" disabled={busy} onClick={() => baseError || !pointId ? void loadBase() : loadPoint(pointId)}><AdminIcon name="refresh" size={17} /><span>YENİLE</span></button></div>
      {baseLoading ? <p role="status">Temel veriler yükleniyor…</p> : baseError ? <div className="error banner" role="alert">{baseError}<button className="ghost" onClick={() => void loadBase()}>Temel verileri yeniden dene</button></div> : null}
      {pointError ? <div className="error banner" role="alert">{pointError}<button className="ghost" disabled={pointLoading} onClick={() => loadPoint(pointId)}>Nokta verilerini yeniden dene</button></div> : null}
      {error ? <div className="error banner" role="alert">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="compactForm">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Müşteri no / nokta / bölge ara" />
        <select value={pointId} onChange={(e) => setPointId(e.target.value)}>{filteredPoints.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name} · {p.region?.name || 'Bölge yok'}</option>)}</select>
      </div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Yeni Görevlendirme</h2><p>POINT_OVERRIDE kalıcı nokta istisnasıdır; TEMPORARY belirli tarih aralığı için geçerlidir.</p></div></div>
      <form className="compactForm" onSubmit={createAssignment}>
        <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} required>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name} (@{t.username})</option>)}</select>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="POINT_OVERRIDE">Kalıcı nokta istisnası</option><option value="TEMPORARY">Geçici görevlendirme</option></select>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        {kind === 'TEMPORARY' ? <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required /> : null}
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={240} placeholder="Neden / açıklama (opsiyonel)" />
        <button type="submit" disabled={busy || Boolean(baseError || pointError) || !history}>GÖREVLENDİR</button>
      </form>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>{history?.point.name || 'Nokta'} · Görevlendirme Geçmişi</h2><p>{history?.point.code || '—'} · Bölge varsayılanı: {history?.point.region?.name || 'Bölge yok'}</p></div></div>
      <AdminFilterToolbar resultCount={filteredHistory.length} resultLabel="görevlendirme" refreshing={pointLoading} onRefresh={() => loadPoint(pointId)} onClear={() => { setHistorySearch(''); setHistoryFilter('ALL'); }} activeFilters={[...(historySearch ? [{ id: 'search', label: `Arama: ${historySearch}`, onRemove: () => setHistorySearch('') }] : []), ...(historyFilter !== 'ALL' ? [{ id: 'status', label: historyFilter === 'ACTIVE' ? 'Yalnız aktif' : historyFilter === 'CLOSED' ? 'Kapalı / sona ermiş' : historyFilter === 'POINT_OVERRIDE' ? 'Kalıcı istisna' : 'Geçici', onRemove: () => setHistoryFilter('ALL') }] : [])]}>
        <input aria-label="Görevlendirme geçmişinde ara" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Teknisyen / neden / oluşturan ara" />
        <select aria-label="Görevlendirme durumu" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)}><option value="ALL">Tüm geçmiş</option><option value="ACTIVE">Yalnız aktif</option><option value="CLOSED">Yalnız kapalı / sona ermiş</option><option value="POINT_OVERRIDE">Kalıcı nokta istisnası</option><option value="TEMPORARY">Geçici</option></select>
      </AdminFilterToolbar>
      <div className="tableWrap"><table><thead><tr><th>Teknisyen</th><th>Tür</th><th>Başlangıç</th><th>Bitiş</th><th>Durum</th><th>Neden</th><th></th></tr></thead><tbody>
        {baseError || pointError ? <tr><td colSpan={7}>Görevlendirme verileri alınamadı. Yukarıdaki yeniden deneme aksiyonunu kullanın.</td></tr> : baseLoading || pointLoading ? <tr><td colSpan={7}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Görevlendirmeler yükleniyor</strong><span>Nokta geçmişi hazırlanıyor.</span></div></td></tr> : !pointId || !history ? <tr><td colSpan={7}>Görevlendirmeleri görmek için nokta seçin.</td></tr> : !filteredHistory.length ? <tr><td colSpan={7}><div className="emptyState compact"><AdminIcon name="search" /><strong>Görevlendirme kaydı yok</strong><span>Seçili filtrelerde kayıt bulunamadı.</span></div></td></tr> : filteredHistory.map((a) => {
          const timing = assignmentTimingStatus(a, now);
          return <tr key={a.id}>
            <td><strong>{a.technician.name}</strong></td><td>{a.kind === 'POINT_OVERRIDE' ? 'Kalıcı override' : 'Geçici'}</td><td>{new Date(a.startsAt).toLocaleString('tr-TR')}</td><td>{a.endsAt ? new Date(a.endsAt).toLocaleString('tr-TR') : 'Süresiz'}</td><td><span className={timing === 'CURRENT' ? 'pill active' : 'pill'}>{assignmentTimingLabel(timing)}</span></td><td>{a.reason || '—'}</td><td className="actions"><button className="small iconAction" type="button" disabled={busy} onClick={() => void openAudit(a.id)}><AdminIcon name="history" size={15} /><span>AUDIT</span></button>{a.active ? <button className="small" type="button" disabled={busy} onClick={() => void deactivate(a)}><AdminIcon name="error" size={16} /><span>KAPAT</span></button> : null}</td>
          </tr>;
        })}
      </tbody></table></div>
    </section>

    {auditId ? <section className="panel"><div className="panelHeader"><div><h2>Görevlendirme Audit Geçmişi</h2>{audit ? <p>{audit.assignment.kind} · {audit.assignment.active ? 'Aktif' : 'Kapalı'}</p> : null}</div><button className="ghost" onClick={() => { cancelAuditRequest.current?.(); setAuditLoading(false); setAudit(null); setAuditId(''); setAuditError(''); }}><AdminIcon name="error" size={16} /><span>KAPAT</span></button></div>
      <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Kullanıcı</th><th>Not</th><th>Değişiklik</th></tr></thead><tbody>
        {auditLoading ? <tr><td colSpan={5} role="status">Audit geçmişi yükleniyor…</td></tr> : auditError ? <tr><td colSpan={5}><div role="alert">{auditError}<button className="ghost" onClick={() => openAudit(auditId)}>Audit geçmişini yeniden dene</button></div></td></tr> : audit && audit.history.length === 0 ? <tr><td colSpan={5}><div className="emptyState compact"><strong>Audit kaydı yok</strong><span>Bu görevlendirme için değişiklik kaydı bulunmuyor.</span></div></td></tr> : audit?.history.map((h) => <tr key={h.id}><td>{new Date(h.createdAt).toLocaleString('tr-TR')}</td><td>{h.action}</td><td>{h.actor.name}</td><td>{h.note || '—'}</td><td><details><summary>JSON</summary><pre>{JSON.stringify({ before: h.oldValue ?? null, after: h.newValue ?? null }, null, 2)}</pre></details></td></tr>)}
      </tbody></table></div>
    </section> : null}
  </>;
}
