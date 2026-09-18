'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';
import type { AdminLocation, AdminSection } from './admin-navigation';

type Point = { id: string; code: string; name: string; status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED'; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; address?: string | null; region?: { id: string; name: string } | null; aliases: Array<{ alias: string }> };
type Props = { location: AdminLocation; onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void };

export default function PointList({ location, onNavigate }: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [query, setQuery] = useState(location.query ?? '');
  const [status, setStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { void (async () => { try { const response = await fetch('/api/backend/points'); if (!response.ok) throw new Error(`HTTP ${response.status}`); setPoints(await response.json()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoading(false); } })(); }, []);
  const visible = useMemo(() => points.filter((point) => { const text = [point.code, point.name, point.address, point.region?.name, ...point.aliases.map((item) => item.alias)].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR'); return (!query || text.includes(query.toLocaleLowerCase('tr-TR'))) && (status === 'ALL' || point.status === status); }), [points, query, status]);
  return <>
    <section className="panel"><div className="panelHeader"><div><h2>Noktalar</h2><p>Noktaları bulun, filtreleyin ve tekil kayıt için Detay ekranına gidin.</p></div><div className="rowActions"><button className="ghost" onClick={() => onNavigate('bulk-operations')}>Toplu İşlemler</button></div></div>
      <div className="filterBar"><div className="searchField"><AdminIcon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kod, nokta, adres veya bölge ara" aria-label="Nokta ara" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Nokta durum filtresi"><option value="ALL">Tüm durumlar</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select><span className="filterCount">{visible.length} / {points.length}</span></div>
      {error ? <div className="error banner">{error}</div> : null}
      {loading ? <div className="emptyState"><AdminIcon name="clock" /><strong>Noktalar yükleniyor</strong></div> : <div className="tableWrap"><table><thead><tr><th>Kod</th><th>Nokta / Müşteri</th><th>Bölge</th><th>Bakım Tipi</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{visible.length ? visible.map((point) => <tr key={point.id}><td>{point.code}</td><td><strong>{point.name}</strong></td><td>{point.region?.name ?? '—'}</td><td>{point.maintenanceType}</td><td><span className={point.status === 'ACTIVE' ? 'pill active' : 'pill'}>{point.status}</span></td><td><button className="small" onClick={() => onNavigate('point-detail', { pointId: point.id, query })}>Detay</button></td></tr>) : <tr><td colSpan={6}>Eşleşen nokta yok.</td></tr>}</tbody></table></div>}
    </section>
  </>;
}
