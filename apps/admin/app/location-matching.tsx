'use client';

import { useEffect, useState } from 'react';

type Point = {
  id: string;
  code: string;
  name: string;
  sapName?: string | null;
  address?: string | null;
  googlePlaceId?: string | null;
  googleBusinessName?: string | null;
  canonicalLatitude?: string | number | null;
  canonicalLongitude?: string | number | null;
  locationSource?: 'UNKNOWN' | 'GOOGLE_MATCH' | 'FIELD_CONFIRMED' | 'MANUAL';
  locationConfidence?: number;
};

export default function LocationMatching() {
  const [points, setPoints] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function load() {
    setPoints(await api<Point[]>('/api/backend/points'));
  }

  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);

  async function discover(path: string) {
    setBusy(true); setError('');
    try { await api(path, { method: 'POST' }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return <section className="panel" id="location-matching">
    <div className="panelHeader">
      <div><h2>SAP / Google Eşleştirme</h2><p>Saha adı, SAP resmi adı ve Google Places sonucunu aynı ekranda karşılaştır.</p></div>
      <button className="ghost" onClick={() => void discover('/api/backend/points/address-discovery/run?limit=25')} disabled={busy}>EKSİKLERİ TARA</button>
    </div>
    {error ? <div className="error banner">{error}</div> : null}
    <div className="tableWrap"><table>
      <thead><tr><th>Müşteri No</th><th>Saha / SAP</th><th>Google eşleşmesi</th><th>Güven</th><th>Konum</th><th></th></tr></thead>
      <tbody>{points.map((point) => <tr key={point.id}>
        <td>{point.code}</td>
        <td><strong>{point.name}</strong><div className="muted">SAP: {point.sapName || '—'}</div></td>
        <td><strong>{point.googleBusinessName || 'Eşleşme yok'}</strong><div className="muted">{point.address || point.googlePlaceId || 'Adres bulunamadı'}</div></td>
        <td><span className={point.locationConfidence && point.locationConfidence >= 75 ? 'pill active' : 'pill'}>{point.locationConfidence ?? 0}%</span></td>
        <td>{point.locationSource && point.locationSource !== 'UNKNOWN' ? point.locationSource : '—'}{point.canonicalLatitude && point.canonicalLongitude ? <div className="muted">{String(point.canonicalLatitude)}, {String(point.canonicalLongitude)}</div> : null}</td>
        <td><button className="small" onClick={() => void discover(`/api/backend/points/${point.id}/address-discovery`)} disabled={busy}>{point.googlePlaceId ? 'YENİDEN TARA' : 'EŞLEŞTİR'}</button></td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
