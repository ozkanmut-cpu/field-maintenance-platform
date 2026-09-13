'use client';

import { useEffect, useMemo, useState } from 'react';

type Point = { id: string; code: string; name: string; maintenanceType: string; region?: { id: string; name: string } | null };
type TimelineItem = { id: string; type: 'MAINTENANCE' | 'ATTEMPT' | 'NON_MAINTENANCE_VISIT' | 'OBLIGATION' | 'ASSIGNMENT'; at: string; data: Record<string, any> };
type TimelineResponse = {
  point: Point;
  counts: { maintenance: number; attempts: number; nonMaintenanceVisits: number; obligations: number; assignments: number };
  items: TimelineItem[];
};

const labels: Record<TimelineItem['type'], string> = {
  MAINTENANCE: 'Bakım', ATTEMPT: 'Bakım denemesi', NON_MAINTENANCE_VISIT: 'Bakım dışı ziyaret', OBLIGATION: 'Yükümlülük', ASSIGNMENT: 'Görevlendirme',
};

export default function PointTimeline() {
  const [points, setPoints] = useState<Point[]>([]);
  const [pointId, setPointId] = useState('');
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'ALL' | TimelineItem['type']>('ALL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function api<T>(path: string): Promise<T> {
    const response = await fetch(path);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function loadPoints() {
    const list = await api<Point[]>('/api/backend/points');
    setPoints(list);
    setPointId((current) => current || list[0]?.id || '');
  }

  async function loadTimeline(id: string) {
    if (!id) return;
    setBusy(true); setError('');
    try { setTimeline(await api<TimelineResponse>(`/api/backend/maintenance/point-timeline?pointId=${encodeURIComponent(id)}&limit=300`)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void loadPoints().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { void loadTimeline(pointId); }, [pointId]);

  const filteredPoints = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return points;
    return points.filter((p) => `${p.code} ${p.name} ${p.region?.name ?? ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [points, search]);

  const items = useMemo(() => timeline?.items.filter((item) => type === 'ALL' || item.type === type) ?? [], [timeline, type]);

  function summary(item: TimelineItem) {
    const d = item.data;
    if (item.type === 'MAINTENANCE') return `${d.technician?.name || '—'} · ${d.status} · Fiş ${d.serviceSlipStatus} · Teyit ${d.confirmationStatus}${d.enteredLate ? ' · Geç giriş' : ''}`;
    if (item.type === 'ATTEMPT') return `${d.technician?.name || '—'} · ${d.reason} · ${d.reviewStatus}${d.note ? ` · ${d.note}` : ''}`;
    if (item.type === 'NON_MAINTENANCE_VISIT') return `${d.technician?.name || '—'} · ${d.purpose}${d.note ? ` · ${d.note}` : ''}`;
    if (item.type === 'OBLIGATION') return `${d.cycleKey} · ${d.status} · ${new Date(d.dueStart).toLocaleDateString('tr-TR')}–${new Date(d.dueEnd).toLocaleDateString('tr-TR')}`;
    return `${d.technician?.name || '—'} · ${d.kind} · ${d.active ? 'Aktif' : 'Kapalı'}${d.reason ? ` · ${d.reason}` : ''}`;
  }

  return <>
    <section className="panel">
      <div className="panelHeader"><div><h2>Nokta Timeline</h2><p>Bir noktanın bakım, deneme, ziyaret, yükümlülük ve görevlendirme geçmişini tek kronolojide incele.</p></div><button className="ghost" disabled={busy} onClick={() => void loadTimeline(pointId)}>YENİLE</button></div>
      {error ? <div className="error banner">{error}</div> : null}
      <div className="compactForm">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Müşteri no / nokta / bölge ara" />
        <select value={pointId} onChange={(e) => setPointId(e.target.value)}>{filteredPoints.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name} · {p.region?.name || 'Bölge yok'}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="ALL">Tüm olaylar</option><option value="MAINTENANCE">Bakımlar</option><option value="ATTEMPT">Bakım denemeleri</option><option value="NON_MAINTENANCE_VISIT">Bakım dışı ziyaretler</option><option value="OBLIGATION">Yükümlülükler</option><option value="ASSIGNMENT">Görevlendirmeler</option></select>
      </div>
    </section>

    {timeline ? <>
      <section className="dashboardGrid">
        <div className="dashboardCard"><span>Bakım</span><strong>{timeline.counts.maintenance}</strong><small>Toplam kayıt</small></div>
        <div className="dashboardCard"><span>Deneme</span><strong>{timeline.counts.attempts}</strong><small>Yapılamadı / deneme</small></div>
        <div className="dashboardCard"><span>Diğer ziyaret</span><strong>{timeline.counts.nonMaintenanceVisits}</strong><small>Bakım dışı</small></div>
        <div className="dashboardCard"><span>Yükümlülük</span><strong>{timeline.counts.obligations}</strong><small>Bakım dönemleri</small></div>
        <div className="dashboardCard"><span>Görevlendirme</span><strong>{timeline.counts.assignments}</strong><small>Özel atamalar</small></div>
      </section>

      <section className="panel">
        <div className="panelHeader"><div><h2>{timeline.point.name}</h2><p>{timeline.point.code} · {timeline.point.region?.name || 'Bölge yok'} · {timeline.point.maintenanceType}</p></div><span className="pill">{items.length} olay</span></div>
        <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Özet</th><th>Detay</th></tr></thead><tbody>
          {items.length === 0 ? <tr><td colSpan={4}>Kayıt yok.</td></tr> : items.map((item) => <tr key={`${item.type}-${item.id}`}><td>{new Date(item.at).toLocaleString('tr-TR')}</td><td><span className="pill">{labels[item.type]}</span></td><td>{summary(item)}</td><td><details><summary>JSON</summary><pre>{JSON.stringify(item.data, null, 2)}</pre></details></td></tr>)}
        </tbody></table></div>
      </section>
    </> : null}
  </>;
}
