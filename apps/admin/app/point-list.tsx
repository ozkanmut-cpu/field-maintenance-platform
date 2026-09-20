'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminIcon } from './admin-icons';
import { AccessibleTable } from './accessible-table';
import { buildAdminLocation, type AdminLocation, type AdminSection } from './admin-navigation';
import { pointListScrollKey, pointListValues } from './admin-navigation-runtime.js';

type Point = { id: string; code: string; name: string; status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED'; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; address?: string | null; region?: { id: string; name: string; technician?: { id: string; name: string; username: string; active: boolean } | null } | null; locationSource?: string | null; locationConfidence?: number | null; aliases: Array<{ alias: string }> };
type Props = { location: AdminLocation; onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void };
const pageSize = 25;

export default function PointList({ location, onNavigate }: Props) {
  const [points, setPoints] = useState<Point[]>([]);
  const [query, setQuery] = useState(location.query ?? '');
  const [status, setStatus] = useState(location.status ?? 'ALL');
  const [region, setRegion] = useState(location.region ?? 'ALL');
  const [maintenanceType, setMaintenanceType] = useState(location.maintenanceType ?? 'ALL');
  const [page, setPage] = useState(Math.max(1, Number(location.page ?? '1') || 1));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const restoredLocation = useRef('');

  useEffect(() => { void (async () => { try { const response = await fetch('/api/backend/points'); if (!response.ok) throw new Error(`HTTP ${response.status}`); setPoints(await response.json()); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoading(false); } })(); }, []);
  useEffect(() => { setQuery(location.query ?? ''); setStatus(location.status ?? 'ALL'); setRegion(location.region ?? 'ALL'); setMaintenanceType(location.maintenanceType ?? 'ALL'); setPage(Math.max(1, Number(location.page ?? '1') || 1)); }, [location.query, location.status, location.region, location.maintenanceType, location.page]);
  const regions = useMemo(() => Array.from(new Map(points.filter((point) => point.region).map((point) => [point.region!.id, point.region!.name])).entries()).sort(([, left], [, right]) => left.localeCompare(right, 'tr')).map(([id, name]) => ({ id, name })), [points]);
  const visible = useMemo(() => points.filter((point) => { const text = [point.code, point.name, point.address, point.region?.name, ...point.aliases.map((item) => item.alias)].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR'); return (!query || text.includes(query.toLocaleLowerCase('tr-TR'))) && (status === 'ALL' || point.status === status) && (region === 'ALL' || point.region?.id === region) && (maintenanceType === 'ALL' || point.maintenanceType === maintenanceType); }), [points, query, status, region, maintenanceType]);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visiblePage = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function listValues(nextQuery = query, nextStatus = status, nextRegion = region, nextMaintenanceType = maintenanceType, nextPage = currentPage, scrollY = window.scrollY) {
    return pointListValues({ query: nextQuery, status: nextStatus, region: nextRegion, maintenanceType: nextMaintenanceType, page: nextPage, scrollY });
  }
  function rememberListScroll(values = listValues()) {
    sessionStorage.setItem(pointListScrollKey(values), String(window.scrollY));
    const current = listValues(query, status, region, maintenanceType, currentPage, window.scrollY);
    window.history.replaceState({ ...(window.history.state ?? {}), scrollY: window.scrollY }, '', buildAdminLocation('points', current));
  }
  function pushListLocation(nextQuery = query, nextStatus = status, nextRegion = region, nextMaintenanceType = maintenanceType, nextPage = currentPage) {
    rememberListScroll();
    const next = listValues(nextQuery, nextStatus, nextRegion, nextMaintenanceType, nextPage, 0);
    window.history.pushState({ scrollY: 0 }, '', buildAdminLocation('points', next));
  }
  useEffect(() => { const values = pointListValues({ query: location.query, status: location.status, region: location.region, maintenanceType: location.maintenanceType, page: Number(location.page ?? '1') || 1 }); const key = `${pointListScrollKey(values)}|${location.scrollY ?? ''}|${points.length}`; if (!points.length || restoredLocation.current === key) return; restoredLocation.current = key; const y = Number(location.scrollY ?? sessionStorage.getItem(pointListScrollKey(values)) ?? '0'); if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' })); }, [location.query, location.status, location.region, location.maintenanceType, location.page, location.scrollY, points.length]);

  return <>
    <section className="panel"><div className="panelHeader"><div><h2>Noktalar</h2><p>Noktaları bulun, filtreleyin ve tekil kayıt için Detay ekranına gidin.</p></div><div className="rowActions"><button className="ghost" onClick={() => onNavigate('bulk-operations')}>Toplu İşlemler</button></div></div>
      <div className="filterBar pointListFilters"><div className="searchField"><AdminIcon name="search" size={17} /><input value={query} onChange={(event) => { const next = event.target.value; setQuery(next); setPage(1); pushListLocation(next, status, region, maintenanceType, 1); }} placeholder="Kod, nokta, adres veya bölge ara" aria-label="Nokta ara" /></div><select value={status} onChange={(event) => { const next = event.target.value; setStatus(next); setPage(1); pushListLocation(query, next, region, maintenanceType, 1); }} aria-label="Nokta durum filtresi"><option value="ALL">Tüm durumlar</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select><select value={region} onChange={(event) => { const next = event.target.value; setRegion(next); setPage(1); pushListLocation(query, status, next, maintenanceType, 1); }} aria-label="Bölge filtresi"><option value="ALL">Tüm bölgeler</option>{regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={maintenanceType} onChange={(event) => { const next = event.target.value; setMaintenanceType(next); setPage(1); pushListLocation(query, status, region, next, 1); }} aria-label="Bakım tipi filtresi"><option value="ALL">Tüm bakım tipleri</option><option value="STANDARD">STANDARD</option><option value="SMARTCLEAN">SMARTCLEAN</option></select><span className="filterCount">{visible.length} / {points.length}</span></div>
      {error ? <div className="error banner">{error}</div> : null}
      {loading ? <div className="emptyState"><AdminIcon name="clock" /><strong>Noktalar yükleniyor</strong></div> : <><AccessibleTable caption="Nokta listesi"><thead><tr><th>Kod</th><th>Nokta / Müşteri</th><th>Bölge</th><th>Teknisyen</th><th>Bakım Tipi</th><th>Konum</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{visible.length ? visiblePage.map((point) => <tr key={point.id}><td>{point.code}</td><td><strong>{point.name}</strong></td><td>{point.region?.name ?? '—'}</td><td>{point.region?.technician ? <>{point.region.technician.name}{point.region.technician.active ? null : ' (pasif)'}</> : '—'}</td><td>{point.maintenanceType}</td><td>{point.locationSource ?? 'UNKNOWN'} / {point.locationConfidence ?? 0}%</td><td><span className={point.status === 'ACTIVE' ? 'pill active' : 'pill'}>{point.status}</span></td><td><button className="small" onClick={() => { const values = listValues(); rememberListScroll(values); onNavigate('point-detail', { pointId: point.id, ...values }); }}>Detay</button></td></tr>) : <tr><td colSpan={8}>Eşleşen nokta yok.</td></tr>}</tbody></AccessibleTable>{totalPages > 1 ? <div className="rowActions"><span className="filterCount">Sayfa {currentPage} / {totalPages}</span><button className="small" disabled={currentPage === 1} onClick={() => { const next = currentPage - 1; setPage(next); pushListLocation(query, status, region, maintenanceType, next); window.scrollTo({ top: 0, behavior: 'auto' }); }}>Önceki</button><button className="small" disabled={currentPage === totalPages} onClick={() => { const next = currentPage + 1; setPage(next); pushListLocation(query, status, region, maintenanceType, next); window.scrollTo({ top: 0, behavior: 'auto' }); }}>Sonraki</button></div> : null}</>}
    </section>
  </>;
}
