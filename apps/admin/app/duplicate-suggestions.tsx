'use client';

import { useEffect, useMemo, useState } from 'react';

type PointSummary = {
  id: string; code: string; name: string; aliases: string[]; address?: string | null;
  regionId?: string | null; status: string; googlePlaceId?: string | null; googleBusinessName?: string | null;
};
type Suggestion = {
  score: number; reasons: string[]; nameSimilarity: number; addressSimilarity?: number | null;
  distanceMeters?: number | null; sameRegion: boolean; left: PointSummary; right: PointSummary;
};
type Result = { scannedPoints: number; suggestionCount: number; items: Suggestion[]; autoMerged: number };

const reasonLabels: Record<string, string> = {
  AYNI_GOOGLE_PLACE_ID: 'Aynı Google Place',
  'ÇOK_BENZER_ISIM': 'Çok benzer isim',
  YAKIN_KONUM_VE_BENZER_ISIM: 'Yakın konum + benzer isim',
  BENZER_ADRES: 'Benzer adres',
};

export default function DuplicateSuggestions() {
  const [data, setData] = useState<Result | null>(null);
  const [minScore, setMinScore] = useState(0.65);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/backend/points/duplicate-suggestions?limit=500');
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
      setData(body as Result);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return (data?.items ?? []).filter((item) => {
      if (item.score < minScore) return false;
      if (!q) return true;
      const text = `${item.left.code} ${item.left.name} ${item.left.googleBusinessName ?? ''} ${item.right.code} ${item.right.name} ${item.right.googleBusinessName ?? ''}`.toLocaleLowerCase('tr-TR');
      return text.includes(q);
    });
  }, [data, minScore, query]);

  function pct(value: number | null | undefined) { return value == null ? '—' : `${Math.round(value * 100)}%`; }

  return <>
    <section className="dashboardGrid">
      <div className="dashboardCard"><span>Taranan nokta</span><strong>{data?.scannedPoints ?? 0}</strong><small>Duplicate motoru</small></div>
      <div className="dashboardCard"><span>Öneri</span><strong>{data?.suggestionCount ?? 0}</strong><small>Toplam aday çift</small></div>
      <div className="dashboardCard"><span>Filtre sonrası</span><strong>{items.length}</strong><small>İncelenecek çift</small></div>
      <div className="dashboardCard"><span>Otomatik merge</span><strong>{data?.autoMerged ?? 0}</strong><small>Güvenlik gereği kapalı</small></div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Mükerrer Nokta Önerileri</h2><p>İsim, adres, fiziksel yakınlık ve Google Place sinyallerine göre olası mükerrer kayıtları incele. Sistem otomatik birleştirme yapmaz.</p></div><button className="ghost" disabled={busy} onClick={() => void load()}>YENİDEN TARA</button></div>
      {error ? <div className="error banner">{error}</div> : null}
      <div className="compactForm">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Müşteri no / nokta adı / Google adı ara" />
        <select value={String(minScore)} onChange={(e) => setMinScore(Number(e.target.value))}>
          <option value="0.5">Skor ≥ %50</option><option value="0.65">Skor ≥ %65</option><option value="0.75">Skor ≥ %75</option><option value="0.85">Skor ≥ %85</option><option value="0.95">Skor ≥ %95</option>
        </select>
      </div>
    </section>

    <section className="panel">
      <div className="tableWrap"><table><thead><tr><th>Skor</th><th>1. Nokta</th><th>2. Nokta</th><th>Sinyaller</th><th>Benzerlik</th><th>Mesafe</th></tr></thead><tbody>
        {items.length === 0 ? <tr><td colSpan={6}>Bu filtrelerde mükerrer aday yok.</td></tr> : items.map((item, index) => <tr key={`${item.left.id}-${item.right.id}-${index}`}>
          <td><strong>{pct(item.score)}</strong><div className="muted">{item.sameRegion ? 'Aynı bölge' : 'Farklı bölge'}</div></td>
          <td><strong>{item.left.name}</strong><div className="muted">{item.left.code}</div><div className="muted">{item.left.googleBusinessName || 'Google adı yok'}</div><div className="muted">{item.left.address || 'Adres yok'}</div>{item.left.aliases?.length ? <div className="muted">Alias: {item.left.aliases.join(', ')}</div> : null}</td>
          <td><strong>{item.right.name}</strong><div className="muted">{item.right.code}</div><div className="muted">{item.right.googleBusinessName || 'Google adı yok'}</div><div className="muted">{item.right.address || 'Adres yok'}</div>{item.right.aliases?.length ? <div className="muted">Alias: {item.right.aliases.join(', ')}</div> : null}</td>
          <td>{item.reasons.map((reason) => <span className="pill" key={reason}>{reasonLabels[reason] || reason}</span>)}</td>
          <td>İsim {pct(item.nameSimilarity)}<div className="muted">Adres {pct(item.addressSimilarity)}</div></td>
          <td>{item.distanceMeters == null ? '—' : `${item.distanceMeters} m`}{item.left.googlePlaceId && item.left.googlePlaceId === item.right.googlePlaceId ? <div className="muted">Place ID aynı</div> : null}</td>
        </tr>)}
      </tbody></table></div>
    </section>
  </>;
}
