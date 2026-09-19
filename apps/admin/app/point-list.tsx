'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminIcon } from './admin-icons';
import { buildAdminLocation, type AdminLocation, type AdminSection } from './admin-navigation';

type Point = { id: string; code: string; name: string; status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED'; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; address?: string | null; region?: { id: string; name: string } | null; aliases: Array<{ alias: string }> };
type Props = { location: AdminLocation; onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void };
const pageSize = 25;

export default function PointList({ location, onNavigate }: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [query, setQuery] = useState(location.query ?? '');
  const [status, setStatus] = useState(location.status ?? 'ALL');
  const [page, setPage] = useState(Math.max(1, Number(location.page ?? '1') || 1));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const restoredLocation = useRef('');

  useEffect(() => { void (async () => { try { const response = await fetch('/api/backend/points'); if (!response.ok) throw new Error(`HTTP ${response.status}`); setPoints(await response.json()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoading(false); } })(); }, []);
  useEffect(() => { setQuery(location.query ?? ''); setStatus(location.status ?? 'ALL'); setPage(Math.max(1, Number(location.page ?? '1') || 1)); }, [location.query, location.status, location.page]);
  const visible = useMemo(() => points.filter((point) => { const text = [point.code, point.name, point.address, point.region?.name, ...point.aliases.map((item) => item.alias)].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR'); return (!query || text.includes(query.toLocaleLowerCase('tr-TR'))) && (status === 'ALL' || point.status === status); }), [points, query, status]);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visiblePage = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  function listValues(nextQuery = query, nextStatus = status, nextPage = currentPage, scrollY = window.scrollY) { return { ...(nextQuery ? { query: nextQuery } : {}), ...(nextStatus !== 'ALL' ? { status: nextStatus } : {}), ...(nextPage > 1 ? { page: String(nextPage) } : {}), ...(scrollY > 0 ? { scrollY: String(scrollY) } : {}) }; }
  function replaceListLocation(nextQuery = query, nextStatus = status, nextPage = currentPage, scrollY = 0) { window.history.replaceState(window.history.state, '', buildAdminLocation('points', listValues(nextQuery, nextStatus, nextPage, scrollY))); }
  useEffect(() => { const key = `${location.query ?? ''}|${location.status ?? 'ALL'}|${location.page ?? '1'}|${location.scrollY ?? '0'}|${points.length}`; if (!points.length || restoredLocation.current === key) return; restoredLocation.current = key; const y = Number(location.scrollY ?? '0'); if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' })); }, [location.query, location.status, location.page, location.scrollY, points.length]);

  return <section className="panel"><div className="panelHeader"><div><h2>Noktalar</h2><p>Noktaları bulun, filtreleyin ve tekil kayıt için Detay ekranına gidin.</p></div><div className="rowActions"><button className="ghost" onClick={() => onNavigate('bulk-operations')}>Toplu İşlemler</button></div></div>
    <div className="filterBar"><div className="searchField"><AdminIcon name="search" size={17} /><input value={query} onChange={(event) => { const next = event.target.value; setQuery(next); setPage(1); replaceListLocation(next, status, 1); }} placeholder="Kod, nokta, adres veya bölge ara" aria-label="Nokta ara" /></div><select value={status} onChange={(event) => { const next = event.target.value; setStatus(next); setPage(1); replaceListLocation(query, next, 1); }} aria-label="Nokta durum filtresi"><option value="ALL">Tüm durumlar</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select><span className="filterCount">{visible.length} / {points.length}</span></div>
    {error ? <div className="error banner">{error}</div> : null}
    {loading ? <div className="emptyState"><AdminIcon name="clock" /><strong>Noktalar yükleniyor</strong></div> : <><div className="tableWrap"><table><thead><tr><th>Kod</th><th>Nokta / Müşteri</th><th>Bölge</th><th>Bakım Tipi</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{visible.length ? visiblePage.map((point) => <tr key={point.id}><td>{point.code}</td><td><strong>{point.name}</strong></td><td>{point.region?.name ?? '—'}</td><td>{point.maintenanceType}</td><td><span className={point.status === 'ACTIVE' ? 'pill active' : 'pill'}>{point.status}</span></td><td><button className="small" onClick={() => { const values = listValues(); window.history.replaceState(window.history.state, '', buildAdminLocation('points', values)); onNavigate('point-detail', { pointId: point.id, ...values }); }}>Detay</button></td></tr>) : <tr><td colSpan={6}>Eşleşen nokta yok.</td></tr>}</tbody></table></div>{totalPages > 1 ? <div className="rowActions"><span className="filterCount">Sayfa {currentPage} / {totalPages}</span><button className="small" disabled={currentPage === 1} onClick={() => { const next = currentPage - 1; setPage(next); replaceListLocation(query, status, next); window.scrollTo({ top: 0, behavior: 'auto' }); }}>Önceki</button><button className="small" disabled={currentPage === totalPages} onClick={() => { const next = currentPage + 1; setPage(next); replaceListLocation(query, status, next); window.scrollTo({ top: 0, behavior: 'auto' }); }}>Sonraki</button></div> : null}</>}
  </section>;
}
