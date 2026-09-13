'use client';

import { useEffect, useMemo, useState } from 'react';

type User = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type PaperworkStatus = 'PENDING' | 'PRESENT' | 'MISSING';
type PaperworkKind = 'SERVICE_SLIP' | 'CONFIRMATION';
type MaintenanceItem = {
  type: string; id: string; at: string; performedAt?: string; serviceSlipStatus?: PaperworkStatus; confirmationStatus?: PaperworkStatus;
  point?: { id: string; code: string; name: string; maintenanceType?: string };
};
type TechnicianHistory = { date: string; maintenanceCount: number; items: MaintenanceItem[] };
type PaperworkHistoryItem = {
  id: string; kind: PaperworkKind; previousStatus: PaperworkStatus; newStatus: PaperworkStatus;
  changedAt: string; note?: string | null; changedBy: { id: string; name: string };
};

const statusLabel: Record<PaperworkStatus, string> = { PENDING: 'Bekliyor', PRESENT: 'Var', MISSING: 'Eksik' };

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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
    setBusy(true); setError('');
    try {
      const data = await api<TechnicianHistory>(`/api/backend/maintenance/technician-history?technicianId=${encodeURIComponent(technicianId)}&date=${encodeURIComponent(date)}`);
      setVisits(data.items.filter((item) => item.type === 'MAINTENANCE'));
      setSelected([]); setHistoryVisitId(''); setHistory([]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void loadTechnicians().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { void loadVisits(); }, [technicianId, date]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return visits;
    return visits.filter((v) => `${v.point?.code ?? ''} ${v.point?.name ?? ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [visits, search]);

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
    if (!selected.length) { setError('Toplu işlem için en az bir bakım seç.'); return; }
    if (!window.confirm(`${selected.length} bakım kaydında ${bulkKind === 'SERVICE_SLIP' ? 'Servis Fişi' : 'Teyit'} durumu ${statusLabel[bulkStatus]} yapılsın mı?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/backend/maintenance/paperwork/bulk', {
        method: 'POST',
        body: JSON.stringify({ items: selected.map((visitId) => ({ visitId, kind: bulkKind, status: bulkStatus, ...(bulkNote.trim() ? { note: bulkNote.trim() } : {}) })) }),
      });
      setNotice(`${selected.length} bakım kaydının evrak durumu güncellendi.`);
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

  const pendingSlip = visits.filter((v) => v.serviceSlipStatus === 'PENDING').length;
  const missingSlip = visits.filter((v) => v.serviceSlipStatus === 'MISSING').length;
  const pendingConfirmation = visits.filter((v) => v.confirmationStatus === 'PENDING').length;
  const missingConfirmation = visits.filter((v) => v.confirmationStatus === 'MISSING').length;

  return <>
    <section className="dashboardGrid">
      <div className="dashboardCard"><span>Bakım</span><strong>{visits.length}</strong><small>{date}</small></div>
      <div className="dashboardCard"><span>Servis fişi bekleyen</span><strong>{pendingSlip}</strong><small>Eksik: {missingSlip}</small></div>
      <div className="dashboardCard"><span>Teyit bekleyen</span><strong>{pendingConfirmation}</strong><small>Eksik: {missingConfirmation}</small></div>
      <div className="dashboardCard"><span>Seçili</span><strong>{selected.length}</strong><small>Toplu işlem için</small></div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Evrak Yönetimi</h2><p>Teknisyen ve güne göre bakım kayıtlarını getir; servis fişi ve teyit durumlarını yönet.</p></div><button className="ghost" disabled={busy} onClick={() => void loadVisits()}>YENİLE</button></div>
      {error ? <div className="error banner">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="compactForm">
        <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name} (@{t.username})</option>)}</select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Müşteri no / nokta ara" />
      </div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Toplu Evrak İşlemi</h2><p>Seçili bakım kayıtlarına tek seferde aynı evrak durumunu uygula.</p></div></div>
      <div className="compactForm">
        <select value={bulkKind} onChange={(e) => setBulkKind(e.target.value as PaperworkKind)}><option value="SERVICE_SLIP">Servis Fişi</option><option value="CONFIRMATION">Teyit</option></select>
        <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as PaperworkStatus)}><option value="PRESENT">Var</option><option value="MISSING">Eksik</option><option value="PENDING">Bekliyor</option></select>
        <input value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} maxLength={250} placeholder="Toplu işlem notu (opsiyonel)" />
        <button disabled={busy || !selected.length} onClick={() => void bulkUpdate()}>SEÇİLİLERİ GÜNCELLE</button>
      </div>
    </section>

    <section className="panel">
      <div className="tableWrap"><table><thead><tr><th><input type="checkbox" checked={visible.length > 0 && visible.every((v) => selected.includes(v.id))} onChange={toggleAll} /></th><th>Saat</th><th>Nokta</th><th>Servis Fişi</th><th>Teyit</th><th></th></tr></thead><tbody>
        {visible.length === 0 ? <tr><td colSpan={6}>Bu filtrede bakım kaydı yok.</td></tr> : visible.map((visit) => <tr key={visit.id}>
          <td><input type="checkbox" checked={selected.includes(visit.id)} onChange={() => toggle(visit.id)} /></td>
          <td>{new Date(visit.performedAt || visit.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td><strong>{visit.point?.name || '—'}</strong><div className="muted">{visit.point?.code || '—'}</div></td>
          <td><select value={visit.serviceSlipStatus || 'PENDING'} disabled={busy} onChange={(e) => void updateOne(visit.id, 'SERVICE_SLIP', e.target.value as PaperworkStatus)}><option value="PENDING">Bekliyor</option><option value="PRESENT">Var</option><option value="MISSING">Eksik</option></select></td>
          <td><select value={visit.confirmationStatus || 'PENDING'} disabled={busy} onChange={(e) => void updateOne(visit.id, 'CONFIRMATION', e.target.value as PaperworkStatus)}><option value="PENDING">Bekliyor</option><option value="PRESENT">Var</option><option value="MISSING">Eksik</option></select></td>
          <td><button className="small" disabled={busy} onClick={() => void openHistory(visit.id)}>GEÇMİŞ</button></td>
        </tr>)}
      </tbody></table></div>
    </section>

    {historyVisitId ? <section className="panel"><div className="panelHeader"><div><h2>Evrak Değişiklik Geçmişi</h2><p>Ziyaret: {historyVisitId}</p></div><button className="ghost" onClick={() => { setHistoryVisitId(''); setHistory([]); }}>KAPAT</button></div>
      <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>Evrak</th><th>Önce</th><th>Sonra</th><th>Kullanıcı</th><th>Not</th></tr></thead><tbody>
        {history.length === 0 ? <tr><td colSpan={6}>Bu ziyaret için evrak değişikliği yok.</td></tr> : history.map((h) => <tr key={h.id}><td>{new Date(h.changedAt).toLocaleString('tr-TR')}</td><td>{h.kind === 'SERVICE_SLIP' ? 'Servis Fişi' : 'Teyit'}</td><td>{statusLabel[h.previousStatus]}</td><td><strong>{statusLabel[h.newStatus]}</strong></td><td>{h.changedBy.name}</td><td>{h.note || '—'}</td></tr>)}
      </tbody></table></div>
    </section> : null}
  </>;
}
