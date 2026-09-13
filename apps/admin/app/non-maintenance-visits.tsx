'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';

type Technician = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type Purpose = 'BREAKDOWN' | 'SURVEY' | 'INSTALLATION' | 'REMOVAL';
type Visit = {
  id: string; purpose: Purpose; note?: string | null; visitedAt: string; locationCapturedAt: string;
  latitude: string | number; longitude: string | number; accuracyMeters?: string | number | null;
  point: { id: string; code: string; name: string; status: string };
  technician: { id: string; name: string };
};
type HistoryResponse = { date: string; technician: { id: string; name: string }; count: number; items: Omit<Visit, 'technician'>[] };

const purposeLabels: Record<Purpose, string> = {
  BREAKDOWN: 'Arıza', SURVEY: 'Keşif', INSTALLATION: 'Kurulum', REMOVAL: 'Söküm',
};

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function NonMaintenanceVisits() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [date, setDate] = useState(todayLocal());
  const [technicianId, setTechnicianId] = useState('ALL');
  const [purpose, setPurpose] = useState<'ALL' | Purpose>('ALL');
  const [query, setQuery] = useState('');
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
      const users = await api<Technician[]>('/api/backend/users');
      const techs = users.filter((u) => u.role === 'TECHNICIAN' && u.active);
      setTechnicians(techs);
      const targets = technicianId === 'ALL' ? techs : techs.filter((t) => t.id === technicianId);
      const results = await Promise.all(targets.map(async (tech) => {
        const data = await api<HistoryResponse>(`/api/backend/maintenance/non-maintenance-visits?technicianId=${encodeURIComponent(tech.id)}&date=${encodeURIComponent(date)}`);
        return data.items.map((item) => ({ ...item, technician: { id: tech.id, name: tech.name } }));
      }));
      setVisits(results.flat().sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime()));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [date, technicianId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return visits.filter((item) => {
      if (purpose !== 'ALL' && item.purpose !== purpose) return false;
      if (!q) return true;
      return `${item.point.code} ${item.point.name} ${item.technician.name} ${item.note ?? ''}`.toLocaleLowerCase('tr-TR').includes(q);
    });
  }, [visits, purpose, query]);

  const purposeCounts = useMemo(() => Object.fromEntries(Object.keys(purposeLabels).map((key) => [key, visits.filter((v) => v.purpose === key).length])) as Record<Purpose, number>, [visits]);
  const technicianCounts = useMemo(() => technicians.map((t) => ({ ...t, count: visits.filter((v) => v.technician.id === t.id).length })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count), [technicians, visits]);

  return <>
    <section className="dashboardGrid">
      <div className="dashboardCard"><span>Toplam ziyaret</span><strong>{visits.length}</strong><small>{date}</small></div>
      <div className="dashboardCard"><span>Arıza</span><strong>{purposeCounts.BREAKDOWN}</strong><small>Bakım dışı</small></div>
      <div className="dashboardCard"><span>Keşif</span><strong>{purposeCounts.SURVEY}</strong><small>Bakım dışı</small></div>
      <div className="dashboardCard"><span>Kurulum / Söküm</span><strong>{purposeCounts.INSTALLATION + purposeCounts.REMOVAL}</strong><small>{purposeCounts.INSTALLATION} / {purposeCounts.REMOVAL}</small></div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Bakım Dışı Ziyaretler</h2><p>Arıza, keşif, kurulum ve söküm ziyaretlerini teknisyen ve tarih bazında incele.</p></div><button className="ghost iconAction" onClick={() => void load()} disabled={busy}><AdminIcon name="refresh" size={17} /><span>YENİLE</span></button></div>
      {error ? <div className="error banner">{error}</div> : null}
      <div className="compactForm">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}><option value="ALL">Tüm teknisyenler</option>{technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}><option value="ALL">Tüm amaçlar</option>{Object.entries(purposeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Müşteri no / nokta / teknisyen / not ara" />
      </div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Günlük Dağılım</h2><p>Seçili tarihte bakım dışı ziyaret yapan teknisyenler.</p></div><span className="pill">{technicianCounts.length} teknisyen</span></div>
      <div className="tableWrap"><table><thead><tr><th>Teknisyen</th><th>Ziyaret</th><th>Pay</th></tr></thead><tbody>{busy && visits.length === 0 ? <tr><td colSpan={3}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Ziyaretler yükleniyor</strong><span>Günlük teknisyen dağılımı hazırlanıyor.</span></div></td></tr> : technicianCounts.length === 0 ? <tr><td colSpan={3}><div className="emptyState compact"><AdminIcon name="visit" /><strong>Ziyaret yok</strong><span>Seçili tarihte bakım dışı ziyaret kaydı bulunmuyor.</span></div></td></tr> : technicianCounts.map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.count}</td><td>{visits.length ? `%${Math.round(t.count / visits.length * 100)}` : '%0'}</td></tr>)}</tbody></table></div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Ziyaret Kayıtları</h2><p>{filtered.length} kayıt gösteriliyor.</p></div></div>
      <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>Teknisyen</th><th>Nokta</th><th>Amaç</th><th>Not</th><th>Konum</th></tr></thead><tbody>
        {busy && visits.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Ziyaret kayıtları yükleniyor</strong><span>Seçili tarih ve teknisyen kayıtları getiriliyor.</span></div></td></tr> : filtered.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="search" /><strong>Kayıt bulunamadı</strong><span>Arama, amaç veya teknisyen filtresini değiştir.</span></div></td></tr> : filtered.map((item) => <tr key={item.id}><td>{new Date(item.visitedAt).toLocaleString('tr-TR')}</td><td><strong>{item.technician.name}</strong></td><td><strong>{item.point.name}</strong><div className="muted">{item.point.code} · {item.point.status}</div></td><td><span className="pill">{purposeLabels[item.purpose]}</span></td><td>{item.note || '—'}</td><td>{Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}<div className="muted">{item.accuracyMeters == null ? 'Hassasiyet yok' : `±${Math.round(Number(item.accuracyMeters))} m`}</div></td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}
