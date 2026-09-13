'use client';

import { useEffect, useMemo, useState } from 'react';

type Alias = { id: string; alias: string; createdAt: string; createdBy?: { id: string; name: string } | null };
type Point = {
  id: string; code: string; name: string; sapName?: string | null; address?: string | null;
  status: string; maintenanceType: string; maintenanceWeek?: number | null; smartcleanReferenceAt?: string | null;
  canonicalLatitude?: string | number | null; canonicalLongitude?: string | number | null;
  locationSource?: string | null; locationConfidence?: number | null; googlePlaceId?: string | null; googleBusinessName?: string | null;
  coolerCount?: number | null; towerCount?: number | null; tapCount?: number | null; smarttapCount?: number | null;
  equipmentVerifiedAt?: string | null; equipmentVerifiedById?: string | null;
  region?: { id: string; name: string } | null; aliases?: Alias[];
};

export default function PointDetails() {
  const [points, setPoints] = useState<Point[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [point, setPoint] = useState<Point | null>(null);
  const [aliases, setAliases] = useState<Alias[]>([]);
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

  async function loadPoints() {
    const list = await api<Point[]>('/api/backend/points');
    setPoints(list);
    setSelectedId((current) => current || list[0]?.id || '');
  }

  async function loadPoint(id: string) {
    if (!id) { setPoint(null); setAliases([]); return; }
    setBusy(true); setError('');
    try {
      const [detail, aliasList] = await Promise.all([
        api<Point>(`/api/backend/points/${id}`),
        api<Alias[]>(`/api/backend/points/${id}/aliases`),
      ]);
      setPoint(detail); setAliases(aliasList);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void loadPoints().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { void loadPoint(selectedId); }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return points;
    return points.filter((p) => `${p.code} ${p.name} ${p.sapName ?? ''} ${p.googleBusinessName ?? ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [points, search]);

  async function addAlias() {
    if (!point) return;
    const alias = window.prompt('Yeni alias / alternatif nokta adı:')?.trim();
    if (!alias) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/backend/points/${point.id}/aliases`, { method: 'POST', body: JSON.stringify({ alias }) });
      await loadPoint(point.id); await loadPoints();
      setNotice('Alias eklendi.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function runAction(path: string, label: string) {
    if (!point) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path, { method: 'POST' });
      await loadPoint(point.id); await loadPoints();
      setNotice(label);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const equipmentComplete = point ? [point.coolerCount, point.towerCount, point.tapCount, point.smarttapCount].every((v) => v != null) : false;

  return <>
    <section className="panel">
      <div className="panelHeader"><div><h2>Nokta Detayı</h2><p>Saha, SAP, Google, alias, ekipman ve konum verilerini tek yerde incele.</p></div><button className="ghost" disabled={busy} onClick={() => void loadPoints()}>YENİLE</button></div>
      {error ? <div className="error banner">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="compactForm">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Müşteri no / saha adı / SAP adı / Google adı ara" />
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {filtered.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select>
      </div>
    </section>

    {point ? <>
      <section className="dashboardGrid">
        <div className="dashboardCard"><span>Konum confidence</span><strong>{point.locationConfidence ?? 0}%</strong><small>{point.locationSource || 'UNKNOWN'}</small></div>
        <div className="dashboardCard"><span>Alias</span><strong>{aliases.length}</strong><small>Alternatif isim</small></div>
        <div className="dashboardCard"><span>Ekipman</span><strong>{equipmentComplete ? 'Tam' : 'Eksik'}</strong><small>Profil durumu</small></div>
        <div className="dashboardCard"><span>Bakım</span><strong>{point.maintenanceType}</strong><small>Hafta {point.maintenanceWeek ?? '—'}</small></div>
      </section>

      <section className="panel">
        <div className="panelHeader"><div><h2>{point.name}</h2><p>{point.code} · {point.region?.name || 'Bölge yok'} · {point.status}</p></div><div className="actions"><button className="small" disabled={busy} onClick={() => void addAlias()}>ALIAS EKLE</button><button className="small" disabled={busy} onClick={() => void runAction(`/api/backend/points/${point.id}/address-discovery`, 'Adres keşfi tamamlandı.')}>ADRES KEŞFİ</button><button className="small" disabled={busy} onClick={() => void runAction(`/api/backend/maintenance/google-place-match?pointId=${encodeURIComponent(point.id)}`, 'Google eşleştirme tamamlandı.')}>GOOGLE EŞLEŞTİR</button><button className="small" disabled={busy} onClick={() => void runAction(`/api/backend/maintenance/location-refresh?pointId=${encodeURIComponent(point.id)}`, 'Konum öğrenimi yenilendi.')}>KONUMU YENİLE</button></div></div>
        <div className="tableWrap"><table><tbody>
          <tr><th>Saha adı</th><td>{point.name}</td><th>SAP resmi adı</th><td>{point.sapName || '—'}</td></tr>
          <tr><th>Google işletme adı</th><td>{point.googleBusinessName || '—'}</td><th>Google Place ID</th><td>{point.googlePlaceId || '—'}</td></tr>
          <tr><th>Adres</th><td colSpan={3}>{point.address || '—'}</td></tr>
          <tr><th>Canonical konum</th><td>{point.canonicalLatitude ?? '—'}, {point.canonicalLongitude ?? '—'}</td><th>Kaynak / confidence</th><td>{point.locationSource || 'UNKNOWN'} · {point.locationConfidence ?? 0}%</td></tr>
          <tr><th>Soğutucu</th><td>{point.coolerCount ?? '—'}</td><th>Kule</th><td>{point.towerCount ?? '—'}</td></tr>
          <tr><th>Musluk</th><td>{point.tapCount ?? '—'}</td><th>SmartTap</th><td>{point.smarttapCount ?? '—'}</td></tr>
          <tr><th>Ekipman doğrulama</th><td colSpan={3}>{point.equipmentVerifiedAt ? new Date(point.equipmentVerifiedAt).toLocaleString('tr-TR') : 'Henüz doğrulanmadı'}</td></tr>
        </tbody></table></div>
      </section>

      <section className="panel"><div className="panelHeader"><div><h2>Alias / Alternatif İsimler</h2><p>Google ve saha eşleştirmelerinde kullanılan ek isimler.</p></div></div>
        <div className="tableWrap"><table><thead><tr><th>Alias</th><th>Ekleyen</th><th>Tarih</th></tr></thead><tbody>
          {aliases.length === 0 ? <tr><td colSpan={3}>Alias yok.</td></tr> : aliases.map((a) => <tr key={a.id}><td><strong>{a.alias}</strong></td><td>{a.createdBy?.name || '—'}</td><td>{new Date(a.createdAt).toLocaleString('tr-TR')}</td></tr>)}
        </tbody></table></div>
      </section>
    </> : null}
  </>;
}
