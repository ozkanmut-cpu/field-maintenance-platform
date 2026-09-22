'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';
import { AdminFilterToolbar, AdminListState } from './admin-primitives';
import type { AdminLocation, AdminSection } from './admin-navigation';
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
export type LocationMatchFilter = 'ALL' | 'READY' | 'REVIEW' | 'MISSING';
export function filterLocationMatches(points: Point[], search: string, filter: LocationMatchFilter) {
const q = search.trim().toLocaleLowerCase('tr-TR');
return points.filter((point) => {
const confidence = point.locationConfidence ?? 0;
const statusOk = filter === 'ALL' || (filter === 'READY' ? Boolean(point.googlePlaceId) && confidence >= 80 : filter === 'REVIEW' ? Boolean(point.googlePlaceId) && confidence < 80 : !point.googlePlaceId);
const textOk = !q || `${point.code} ${point.name} ${point.sapName ?? ''} ${point.googleBusinessName ?? ''} ${point.address ?? ''}`.toLocaleLowerCase('tr-TR').includes(q);
return statusOk && textOk;
});
}
export default function LocationMatching({ onNavigate }: { onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void }) {
const [points, setPoints] = useState<Point[]>([]);
const [busy, setBusy] = useState(false);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [search, setSearch] = useState('');
const [filter, setFilter] = useState<LocationMatchFilter>('REVIEW');
const [lastUpdated, setLastUpdated] = useState('');
async function api<T>(path: string, init?: RequestInit): Promise<T> {
const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
const body = await response.json().catch(() => null);
if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
return body as T;
}
async function load() {
setLoading(true); setError('');
try { setPoints(await api<Point[]>('/api/backend/points')); setLastUpdated(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })); }
catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setLoading(false); }
}
const visible = useMemo(() => filterLocationMatches(points, search, filter), [points, search, filter]);
useEffect(() => {
const saved = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem('admin.locationMatching.filters');
if (saved) try { const parsed = JSON.parse(saved); setSearch(parsed.search ?? ''); setFilter(parsed.filter ?? 'REVIEW'); } catch {}
void load();
}, []);
useEffect(() => { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('admin.locationMatching.filters', JSON.stringify({ search, filter })); }, [search, filter]);
async function discover(path: string) {
setBusy(true); setError('');
try { await api(path, { method: 'POST' }); await load(); }
catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
return <section className="panel" id="location-matching">
<div className="panelHeader">
<div><h2>SAP / Google Eşleştirme</h2><p>Saha adı, SAP resmi adı ve Google Places sonucunu aynı ekranda karşılaştır.</p></div>
<button className="ghost iconAction" onClick={() => void discover('/api/backend/points/address-discovery/run?limit=25')} disabled={busy || loading}><AdminIcon name="refresh" size={17} /><span>EKSİKLERİ TARA</span></button>
</div>
{error ? <AdminListState state="error" title="Eşleştirme verileri alınamadı" description={`${error}. Bağlantıyı kontrol edip yeniden deneyin.`} onRetry={() => void load()} /> : null}
<AdminFilterToolbar resultCount={visible.length} resultLabel="kayıt" lastUpdated={lastUpdated} refreshing={loading} onRefresh={() => void load()} onClear={() => { setSearch(''); setFilter('REVIEW'); }} activeFilters={[...(search ? [{ id: 'search', label: `Arama: ${search}`, onRemove: () => setSearch('') }] : []), ...(filter !== 'ALL' ? [{ id: 'status', label: filter === 'READY' ? 'Eşleşme hazır' : filter === 'REVIEW' ? 'Kontrol gerekenler' : 'Eşleşme yok', onRemove: () => setFilter('ALL') }] : [])]}>
<label className="searchField"><AdminIcon name="search" size={18} /><input aria-label="Nokta eşleşmelerinde ara" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nokta adı, adres veya SAP kodu ile ara" /></label><select aria-label="Eşleşme durumu" value={filter} onChange={(e) => setFilter(e.target.value as LocationMatchFilter)}><option value="REVIEW">Kontrol gerekenler</option><option value="READY">Eşleşme hazır</option><option value="MISSING">Eşleşme yok</option><option value="ALL">Tüm eşleşmeler</option></select>
</AdminFilterToolbar>
<div className="tableWrap"><table>
<thead><tr><th>Müşteri No</th><th>Saha / SAP</th><th>Google eşleşmesi</th><th>Güven</th><th>Konum</th><th></th></tr></thead>
<tbody>{loading ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Eşleşmeler yükleniyor</strong><span>SAP ve Google verileri hazırlanıyor.</span></div></td></tr> : visible.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="search" /><strong>Sonuç bulunamadı</strong><span>Arama veya eşleşme filtresini değiştir.</span></div></td></tr> : visible.map((point) => <tr key={point.id}>
<td>{point.code}</td>
<td><strong>{point.name}</strong><div className="muted">SAP: {point.sapName || '—'}</div></td>
<td><strong>{point.googleBusinessName || 'Eşleşme yok'}</strong><div className="muted">{point.address || point.googlePlaceId || 'Adres bulunamadı'}</div></td>
<td><span className={point.locationConfidence && point.locationConfidence >= 75 ? 'pill active' : 'pill'}>{point.locationConfidence ?? 0}%</span></td>
<td>{point.locationSource && point.locationSource !== 'UNKNOWN' ? point.locationSource : '—'}{point.canonicalLatitude && point.canonicalLongitude ? <div className="muted">{String(point.canonicalLatitude)}, {String(point.canonicalLongitude)}</div> : null}</td>
<td><div className="rowActions"><button className="small" onClick={() => onNavigate('point-detail', { pointId: point.id })}>DETAY</button><button className="small" onClick={() => void discover(`/api/backend/points/${point.id}/address-discovery`)} disabled={busy}>{point.googlePlaceId ? 'YENİDEN TARA' : 'EŞLEŞTİR'}</button></div></td>
</tr>)}</tbody>
</table></div>
</section>;
}
