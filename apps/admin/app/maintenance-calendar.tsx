'use client';

import { useEffect, useMemo, useState } from 'react';

type Technician = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type DueItem = {
  pointId: string; pointCode: string; pointName: string; regionName: string; address?: string | null;
  maintenanceType: 'STANDARD' | 'SMARTCLEAN'; maintenanceWeek?: number | null;
  dueStart: string; dueEnd: string; priority: 'OVERDUE' | 'CURRENT'; overduePeriods: number;
  technicianId?: string | null; assignmentSource?: string | null;
  coolerCount?: number | null; towerCount?: number | null; tapCount?: number | null; smarttapCount?: number | null;
};
type ObligationHistory = {
  point: { id: string; code: string; name: string; maintenanceType: string };
  totals: { open: number; completed: number; missed: number };
  items: Array<{ id: string; cycleKey: string; dueStart: string; dueEnd: string; status: 'OPEN' | 'COMPLETED' | 'MISSED'; completedAt?: string | null; visits: Array<{ id: string; performedAt: string; status: string }> }>;
};

export default function MaintenanceCalendar() {
  const [items, setItems] = useState<DueItem[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [history, setHistory] = useState<ObligationHistory | null>(null);
  const [asOf, setAsOf] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'CURRENT'>('ALL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function api<T>(path: string): Promise<T> {
    const response = await fetch(path);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function load() {
    setBusy(true); setError('');
    try {
      const suffix = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
      const [due, users] = await Promise.all([
        api<{ asOf: string; count: number; items: DueItem[] }>(`/api/backend/maintenance/due${suffix}`),
        api<Technician[]>('/api/backend/users'),
      ]);
      setItems(due.items);
      setTechnicians(users.filter((user) => user.role === 'TECHNICIAN'));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  async function openHistory(pointId: string) {
    setBusy(true); setError('');
    try { setHistory(await api<ObligationHistory>(`/api/backend/maintenance/obligations/point/${pointId}/history`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const technicianNames = useMemo(() => new Map(technicians.map((t) => [t.id, t.name])), [technicians]);
  const visible = items.filter((item) => filter === 'ALL' || item.priority === filter);
  const overdue = items.filter((item) => item.priority === 'OVERDUE').length;
  const current = items.filter((item) => item.priority === 'CURRENT').length;
  const unassigned = items.filter((item) => !item.technicianId).length;

  return <>
    <section className="dashboardGrid">
      <button className="dashboardCard" onClick={() => setFilter('OVERDUE')}><span>Geciken</span><strong>{overdue}</strong><small>Öncelikli yükümlülükler</small></button>
      <button className="dashboardCard" onClick={() => setFilter('CURRENT')}><span>Bu dönem</span><strong>{current}</strong><small>Aktif bakım penceresi</small></button>
      <button className="dashboardCard" onClick={() => setFilter('ALL')}><span>Toplam açık</span><strong>{items.length}</strong><small>Tüm açık bakım işleri</small></button>
      <button className="dashboardCard" onClick={() => setFilter('ALL')}><span>Atanmamış</span><strong>{unassigned}</strong><small>Teknisyen bekleyen işler</small></button>
    </section>

    <section className="panel priorityPanel">
      <div className="panelHeader">
        <div><h2>Bakım Yükümlülükleri</h2><p>Geciken ve mevcut bakım pencerelerini teknisyen, bölge ve bakım tipine göre takip et.</p></div>
        <div className="actions"><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /><button className="ghost" disabled={busy} onClick={() => void load()}>YENİLE</button></div>
      </div>
      {error ? <div className="error banner">{error}</div> : null}
      <div className="tableWrap"><table>
        <thead><tr><th>Nokta</th><th>Bölge</th><th>Bakım</th><th>Vade</th><th>Durum</th><th>Teknisyen</th><th>Ekipman</th><th></th></tr></thead>
        <tbody>{visible.length === 0 ? <tr><td colSpan={8}>Bu filtrede açık bakım yükümlülüğü yok.</td></tr> : visible.map((item) => <tr key={`${item.pointId}-${item.dueStart}`}>
          <td><strong>{item.pointName}</strong><div className="muted">{item.pointCode} · {item.address || 'Adres yok'}</div></td>
          <td>{item.regionName}</td>
          <td>{item.maintenanceType === 'STANDARD' ? `Standart / Hafta ${item.maintenanceWeek ?? '—'}` : `SmartClean / Hafta ${item.maintenanceWeek ?? '—'}`}</td>
          <td>{new Date(item.dueStart).toLocaleDateString('tr-TR')} — {new Date(item.dueEnd).toLocaleDateString('tr-TR')}</td>
          <td><span className={item.priority === 'OVERDUE' ? 'pill' : 'pill active'}>{item.priority === 'OVERDUE' ? `GECİKMİŞ${item.overduePeriods > 1 ? ` · ${item.overduePeriods} dönem` : ''}` : 'BU DÖNEM'}</span></td>
          <td>{item.technicianId ? technicianNames.get(item.technicianId) || item.technicianId : 'Atanmamış'}<div className="muted">{item.assignmentSource || '—'}</div></td>
          <td>{[item.coolerCount, item.towerCount, item.tapCount, item.smarttapCount].every((v) => v != null) ? <span className="muted">S:{item.coolerCount} K:{item.towerCount} M:{item.tapCount} ST:{item.smarttapCount}</span> : <span className="muted">Profil eksik</span>}</td>
          <td><button className="small" disabled={busy} onClick={() => void openHistory(item.pointId)}>GEÇMİŞ</button></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    {history ? <section className="panel">
      <div className="panelHeader"><div><h2>{history.point.name} · Yükümlülük Geçmişi</h2><p>{history.point.code} · {history.point.maintenanceType}</p></div><button className="ghost" onClick={() => setHistory(null)}>KAPAT</button></div>
      <div className="stats"><div className="stat"><strong>{history.totals.open}</strong><span>Açık</span></div><div className="stat"><strong>{history.totals.completed}</strong><span>Tamamlandı</span></div><div className="stat"><strong>{history.totals.missed}</strong><span>Kaçırıldı</span></div></div>
      <div className="tableWrap"><table><thead><tr><th>Dönem</th><th>Vade</th><th>Durum</th><th>Ziyaret</th></tr></thead><tbody>
        {history.items.slice().reverse().map((item) => <tr key={item.id}><td>{item.cycleKey}</td><td>{new Date(item.dueStart).toLocaleDateString('tr-TR')} — {new Date(item.dueEnd).toLocaleDateString('tr-TR')}</td><td><span className={item.status === 'COMPLETED' ? 'pill active' : 'pill'}>{item.status === 'OPEN' ? 'AÇIK' : item.status === 'COMPLETED' ? 'TAMAMLANDI' : 'KAÇIRILDI'}</span></td><td>{item.visits.length ? item.visits.map((v) => new Date(v.performedAt).toLocaleDateString('tr-TR')).join(', ') : '—'}</td></tr>)}
      </tbody></table></div>
    </section> : null}
  </>;
}
