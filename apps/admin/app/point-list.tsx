'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminIcon } from './admin-icons';
import { AccessibleTable } from './accessible-table';
import { AdminFilterToolbar, AdminListState, type ActiveFilter } from './admin-primitives';
import { buildAdminLocation, type AdminLocation, type AdminSection } from './admin-navigation';
import { pointListScrollKey, pointListValues } from './admin-navigation-runtime.js';

type Point = { id: string; code: string; name: string; status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED'; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; address?: string | null; updatedAt?: string | null; region?: { id: string; name: string; technician?: { id: string; name: string; username: string; active: boolean } | null } | null; locationSource?: string | null; locationConfidence?: number | null; aliases: Array<{ alias: string }> };
type Props = { location: AdminLocation; onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void };
const pageSize = 25;
const statusLabels: Record<Point['status'], string> = { ACTIVE: 'Aktif', PASSIVE: 'Pasif', CANCELLED: 'İptal' };

function maintenanceTypeLabel(value: Point['maintenanceType']) { return value === 'SMARTCLEAN' ? 'Smart Clean' : 'Standart Bakım'; }
function locationSummary(point: Point) {
  const confidence = point.locationConfidence === null || point.locationConfidence === undefined ? '—' : `%${point.locationConfidence}`;
  return point.locationSource === 'GOOGLE' ? `Google doğrulandı · ${confidence}` : `Konum kaydı · ${confidence}`;
}
function formatShortDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
function groupPointsByIdentity(points: Point[]) {
  const groups = new Map<string, Point[]>();
  for (const point of points) {
    const key = point.code.trim().toLocaleUpperCase('tr-TR');
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  return Array.from(groups, ([identity, items]) => ({ identity, items }));
}

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
  const visibleGroups = groupPointsByIdentity(visiblePage);

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
  function clearFilters() {
    setQuery(''); setStatus('ALL'); setRegion('ALL'); setMaintenanceType('ALL'); setPage(1);
    pushListLocation('', 'ALL', 'ALL', 'ALL', 1);
  }
  const activeFilters: ActiveFilter[] = [
    ...(query ? [{ id: 'query', label: `Arama: ${query}`, onRemove: () => { setQuery(''); setPage(1); pushListLocation('', status, region, maintenanceType, 1); } }] : []),
    ...(status !== 'ALL' ? [{ id: 'status', label: `Durum: ${statusLabels[status as Point['status']]}`, onRemove: () => { setStatus('ALL'); setPage(1); pushListLocation(query, 'ALL', region, maintenanceType, 1); } }] : []),
    ...(region !== 'ALL' ? [{ id: 'region', label: `Bölge: ${regions.find((item) => item.id === region)?.name ?? region}`, onRemove: () => { setRegion('ALL'); setPage(1); pushListLocation(query, status, 'ALL', maintenanceType, 1); } }] : []),
    ...(maintenanceType !== 'ALL' ? [{ id: 'maintenance', label: `Bakım tipi: ${maintenanceTypeLabel(maintenanceType as Point['maintenanceType'])}`, onRemove: () => { setMaintenanceType('ALL'); setPage(1); pushListLocation(query, status, region, 'ALL', 1); } }] : []),
  ];
  useEffect(() => { const values = pointListValues({ query: location.query, status: location.status, region: location.region, maintenanceType: location.maintenanceType, page: Number(location.page ?? '1') || 1 }); const key = `${pointListScrollKey(values)}|${location.scrollY ?? ''}|${points.length}`; if (!points.length || restoredLocation.current === key) return; restoredLocation.current = key; const y = Number(location.scrollY ?? sessionStorage.getItem(pointListScrollKey(values)) ?? '0'); if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' })); }, [location.query, location.status, location.region, location.maintenanceType, location.page, location.scrollY, points.length]);

  return <section className="panel adminPanel">
    <div className="panelHeader"><div><h2>Noktalar</h2><p>Noktaları bulun, filtreleyin ve tekil kayıt için Detay ekranına gidin.</p></div><div className="rowActions"><button className="ghost" onClick={() => onNavigate('bulk-operations')}>Toplu İşlemler</button></div></div>
    <h3 className="srOnly">Aktif filtreler ve Filtreleri temizle</h3>
    <AdminFilterToolbar activeFilters={activeFilters} resultCount={visible.length} resultLabel="sonuç" onClear={clearFilters}>
      <label className="searchField"><AdminIcon name="search" size={17} /><input value={query} onChange={(event) => { const next = event.target.value; setQuery(next); setPage(1); pushListLocation(next, status, region, maintenanceType, 1); }} placeholder="Kod, nokta, adres veya bölge ara" aria-label="Nokta ara" /></label>
      <select value={status} onChange={(event) => { const next = event.target.value; setStatus(next); setPage(1); pushListLocation(query, next, region, maintenanceType, 1); }} aria-label="Nokta durum filtresi"><option value="ALL">Tüm durumlar</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select>
      <select value={region} onChange={(event) => { const next = event.target.value; setRegion(next); setPage(1); pushListLocation(query, status, next, maintenanceType, 1); }} aria-label="Bölge filtresi"><option value="ALL">Tüm bölgeler</option>{regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={maintenanceType} onChange={(event) => { const next = event.target.value; setMaintenanceType(next); setPage(1); pushListLocation(query, status, region, next, 1); }} aria-label="Bakım tipi filtresi"><option value="ALL">Tüm bakım tipleri</option><option value="STANDARD">Standart Bakım</option><option value="SMARTCLEAN">Smart Clean</option></select>
    </AdminFilterToolbar>
    {error ? <AdminListState state="error" title="Noktalar yüklenemedi" description={error} /> : loading ? <AdminListState state="loading" title="Noktalar yükleniyor" description="Liste hazırlanıyor." /> : visible.length === 0 ? <AdminListState state="empty" title="Eşleşen nokta yok" description="Aramayı veya aktif filtreleri değiştirin." /> : <>
      <AccessibleTable caption="Nokta listesi" stickyColumns={2}>
        <thead><tr><th>Nokta / Müşteri</th><th>Bölge</th><th>Teknisyen</th><th>Bakım Tipi</th><th>Konum</th><th>Durum</th><th>Son Güncelleme</th><th>İşlem</th></tr></thead>
        {visibleGroups.map((group) => <tbody className="pointRowGroup" key={group.identity} aria-label={group.items.length > 1 ? `${group.identity}: Aynı nokta ${group.items.length} kayıt` : group.identity}>
          {group.items.map((point, rowIndex) => <tr key={point.id}>
            <td><strong>{point.name}</strong><div className="muted">{point.code} · {point.address ?? 'Adres yok'}</div>{group.items.length > 1 && rowIndex === 0 ? <span className="pill">Aynı nokta · {group.items.length} kayıt</span> : null}</td>
            <td>{point.region?.name ?? 'Atanmamış'}</td>
            <td>{point.region?.technician ? <>{point.region.technician.name}{point.region.technician.active ? null : ' (pasif)'}</> : 'Atanmamış'}</td>
            <td><span className="pill">{maintenanceTypeLabel(point.maintenanceType)}</span></td>
            <td><span className="pill" title={`Kaynak: ${point.locationSource ?? 'bilinmiyor'}`}>{locationSummary(point)}</span></td>
            <td><span className={point.status === 'ACTIVE' ? 'pill active' : 'pill'}>{statusLabels[point.status]}</span></td>
            <td>{formatShortDateTime(point.updatedAt)}</td>
            <td><button className="small" onClick={() => { const values = listValues(); rememberListScroll(values); onNavigate('point-detail', { pointId: point.id, ...values }); }}>Detay</button></td>
          </tr>)}
        </tbody>)}
      </AccessibleTable>
      {totalPages > 1 ? <div className="rowActions"><span className="filterCount">Sayfa {currentPage} / {totalPages}</span><button className="small" disabled={currentPage === 1} onClick={() => { const next = currentPage - 1; setPage(next); pushListLocation(query, status, region, maintenanceType, next); window.scrollTo({ top: 0, behavior: 'auto' }); }}>Önceki</button><button className="small" disabled={currentPage === totalPages} onClick={() => { const next = currentPage + 1; setPage(next); pushListLocation(query, status, region, maintenanceType, next); window.scrollTo({ top: 0, behavior: 'auto' }); }}>Sonraki</button></div> : null}
    </>}
  </section>;
}
