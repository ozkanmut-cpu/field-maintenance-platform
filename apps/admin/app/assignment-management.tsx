'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function loadBase() {
    const [pointList, userList] = await Promise.all([api<Point[]>('/api/backend/points'), api<Technician[]>('/api/backend/users')]);
    setPoints(pointList);
    const techs = userList.filter((u) => u.role === 'TECHNICIAN' && u.active);
    setTechnicians(techs);
    setPointId((current) => current || pointList[0]?.id || '');
    setTechnicianId((current) => current || techs[0]?.id || '');
  }

  async function loadPoint(id: string) {
    if (!id) { setHistory(null); setEffective(null); return; }
    setBusy(true); setError('');
    try {
      const [pointHistory, current] = await Promise.all([
        api<PointHistory>(`/api/backend/assignments/point/${id}`),
        api<Effective>(`/api/backend/assignments/effective/${id}`),
      ]);
      setHistory(pointHistory); setEffective(current); setAudit(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void loadBase().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { void loadPoint(pointId); }, [pointId]);

  const filteredPoints = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return points;
    return points.filter((p) => `${p.code} ${p.name} ${p.region?.name ?? ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [points, search]);

  async function createAssignment(event: FormEvent) {
    event.preventDefault();
    if (!pointId || !technicianId || !startsAt) { setError('Nokta, teknisyen ve başlangıç tarihi zorunludur.'); return; }
    if (kind === 'TEMPORARY' && !endsAt) { setError('Geçici görevlendirmede bitiş tarihi zorunludur.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/backend/assignments', {
        method: 'POST',
        body: JSON.stringify({ pointId, technicianId, kind, startsAt: new Date(startsAt).toISOString(), ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      setNotice(kind === 'POINT_OVERRIDE' ? 'Kalıcı nokta istisnası oluşturuldu.' : 'Geçici görevlendirme oluşturuldu.');
      setReason(''); setEndsAt('');
      await loadPoint(pointId);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function deactivate(assignment: Assignment) {
    const closeReason = window.prompt('Görevlendirmeyi kapatma nedeni (opsiyonel):')?.trim();
    if (closeReason === undefined) return;
    if (!window.confirm(`${assignment.technician.name} görevlendirmesi kapatılsın mı?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/backend/assignments/${assignment.id}/deactivate`, { method: 'PATCH', body: JSON.stringify(closeReason ? { reason: closeReason } : {}) });
      setNotice('Görevlendirme kapatıldı.');
      await loadPoint(pointId);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function openAudit(id: string) {
    setBusy(true); setError('');
    try { setAudit(await api<AuditHistory>(`/api/backend/assignments/${id}/audit-history`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const activeCount = history?.assignments.filter((a) => a.active).length ?? 0;
  const overrideCount = history?.assignments.filter((a) => a.kind === 'POINT_OVERRIDE').length ?? 0;
  const temporaryCount = history?.assignments.filter((a) => a.kind === 'TEMPORARY').length ?? 0;

  return <>
    <section className="dashboardGrid">
      <div className="dashboardCard"><span>Effective kaynak</span><strong>{effective?.source ?? '—'}</strong><small>{effective?.technician?.name || 'Teknisyen yok'}</small></div>
      <div className="dashboardCard"><span>Aktif istisna</span><strong>{activeCount}</strong><small>Bu nokta için</small></div>
      <div className="dashboardCard"><span>Kalıcı override</span><strong>{overrideCount}</strong><small>Toplam geçmiş</small></div>
      <div className="dashboardCard"><span>Geçici</span><strong>{temporaryCount}</strong><small>Toplam geçmiş</small></div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Görevlendirme Yönetimi</h2><p>Bölge teknisyenini ezmeden nokta bazlı kalıcı istisna veya süreli görevlendirme tanımla.</p></div><button className="ghost" disabled={busy} onClick={() => void loadPoint(pointId)}>YENİLE</button></div>
      {error ? <div className="error banner">{error}</div> : null}
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
        <button type="submit" disabled={busy}>GÖREVLENDİR</button>
      </form>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>{history?.point.name || 'Nokta'} · Görevlendirme Geçmişi</h2><p>{history?.point.code || '—'} · Bölge varsayılanı: {history?.point.region?.name || 'Bölge yok'}</p></div></div>
      <div className="tableWrap"><table><thead><tr><th>Teknisyen</th><th>Tür</th><th>Başlangıç</th><th>Bitiş</th><th>Durum</th><th>Neden</th><th></th></tr></thead><tbody>
        {!history?.assignments.length ? <tr><td colSpan={7}>Bu nokta için özel görevlendirme geçmişi yok; bölge ataması kullanılıyor.</td></tr> : history.assignments.map((a) => <tr key={a.id}>
          <td><strong>{a.technician.name}</strong></td><td>{a.kind === 'POINT_OVERRIDE' ? 'Kalıcı override' : 'Geçici'}</td><td>{new Date(a.startsAt).toLocaleString('tr-TR')}</td><td>{a.endsAt ? new Date(a.endsAt).toLocaleString('tr-TR') : 'Süresiz'}</td><td><span className={a.active ? 'pill active' : 'pill'}>{a.active ? 'AKTİF' : 'KAPALI'}</span></td><td>{a.reason || '—'}</td><td className="actions"><button className="small" type="button" disabled={busy} onClick={() => void openAudit(a.id)}>AUDIT</button>{a.active ? <button className="small" type="button" disabled={busy} onClick={() => void deactivate(a)}>KAPAT</button> : null}</td>
        </tr>)}
      </tbody></table></div>
    </section>

    {audit ? <section className="panel"><div className="panelHeader"><div><h2>Görevlendirme Audit Geçmişi</h2><p>{audit.assignment.kind} · {audit.assignment.active ? 'Aktif' : 'Kapalı'}</p></div><button className="ghost" onClick={() => setAudit(null)}>KAPAT</button></div>
      <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Kullanıcı</th><th>Not</th><th>Değişiklik</th></tr></thead><tbody>
        {audit.history.map((h) => <tr key={h.id}><td>{new Date(h.createdAt).toLocaleString('tr-TR')}</td><td>{h.action}</td><td>{h.actor.name}</td><td>{h.note || '—'}</td><td><details><summary>JSON</summary><pre>{JSON.stringify({ before: h.oldValue ?? null, after: h.newValue ?? null }, null, 2)}</pre></details></td></tr>)}
      </tbody></table></div>
    </section> : null}
  </>;
}
