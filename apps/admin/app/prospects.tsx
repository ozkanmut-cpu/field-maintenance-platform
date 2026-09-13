'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';
type Region = { id: string; name: string };
type Prospect = {
id: string; name: string; sapNo?: string | null; source: 'GOOGLE_MAPS' | 'MANUAL' | 'EFESIM'; status: string;
googlePlaceId?: string | null; address?: string | null; latitude: string | number; longitude: string | number;
createdAt: string; createdBy: { id: string; name: string }; _count: { visits: number };
};
type ProspectHistory = {
prospect: Prospect & {
convertedPoint?: { id: string; code: string; name: string; status: string; regionId?: string | null } | null;
visits: Array<{ id: string; purpose: 'SURVEY' | 'INSTALLATION'; note?: string | null; visitedAt: string; technician: { id: string; name: string } }>;
};
audit: Array<{ id: string; action: string; note?: string | null; createdAt: string; actor?: { id: string; name: string } | null }>;
};
export default function Prospects() {
const [items, setItems] = useState<Prospect[]>([]);
const [regions, setRegions] = useState<Region[]>([]);
const [history, setHistory] = useState<ProspectHistory | null>(null);
const [busy, setBusy] = useState(false);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [search, setSearch] = useState('');
const [sourceFilter, setSourceFilter] = useState<'ALL' | Prospect['source']>('ALL');
async function api<T>(path: string, init?: RequestInit): Promise<T> {
const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
const body = await response.json().catch(() => null);
if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
return body as T;
}
async function load() {
setLoading(true);
try { const [prospects, regionList] = await Promise.all([
api<Prospect[]>('/api/backend/prospects'),
api<Region[]>('/api/backend/regions'),
]);
setItems(prospects);
setRegions(regionList);
} finally { setLoading(false); }
}
const visible = useMemo(() => { const q = search.trim().toLocaleLowerCase('tr-TR'); return items.filter((item) => (sourceFilter === 'ALL' || item.source === sourceFilter) && (!q || `${item.name} ${item.sapNo ?? ''} ${item.address ?? ''} ${item.createdBy.name}`.toLocaleLowerCase('tr-TR').includes(q))); }, [items, search, sourceFilter]);
useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
async function openHistory(id: string) {
setBusy(true); setError('');
try { setHistory(await api<ProspectHistory>(`/api/backend/prospects/${id}/history`)); }
catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
async function convert(item: Prospect) {
const regionName = window.prompt(`Bölge adını girin:\n${regions.map((r) => r.name).join(', ')}`);
if (regionName === null) return;
const region = regions.find((r) => r.name.toLocaleLowerCase('tr-TR') === regionName.trim().toLocaleLowerCase('tr-TR'));
if (!region) { setError('Geçerli bir bölge adı seçilmelidir.'); return; }
const pointCode = window.prompt('SAP No / nokta kodu:', item.sapNo || '')?.trim();
if (!pointCode) return;
const maintenanceTypeInput = window.prompt('Bakım tipi: STANDARD veya SMARTCLEAN', 'STANDARD')?.trim().toUpperCase();
if (maintenanceTypeInput !== 'STANDARD' && maintenanceTypeInput !== 'SMARTCLEAN') { setError('Bakım tipi STANDARD veya SMARTCLEAN olmalıdır.'); return; }
const payload: Record<string, unknown> = { regionId: region.id, pointCode, maintenanceType: maintenanceTypeInput };
if (maintenanceTypeInput === 'STANDARD') {
const week = window.prompt('Rut haftası: 1 veya 2', '1');
if (week !== '1' && week !== '2') { setError('Rut haftası yalnızca 1 veya 2 olabilir.'); return; }
payload.maintenanceWeek = Number(week);
} else {
const date = window.prompt('SmartClean referans tarihi (YYYY-MM-DD):');
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Geçerli SmartClean referans tarihi girilmelidir.'); return; }
payload.smartcleanReferenceAt = date;
}
const note = window.prompt('Yönetici notu (opsiyonel):')?.trim();
if (note) payload.note = note;
if (!window.confirm(`${item.name} gerçek noktaya dönüştürülsün mü?`)) return;
setBusy(true); setError('');
try {
await api(`/api/backend/prospects/${item.id}/convert`, { method: 'POST', body: JSON.stringify(payload) });
setHistory(null);
await load();
} catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
function sourceLabel(source: Prospect['source']) {
if (source === 'GOOGLE_MAPS') return 'Google Maps';
if (source === 'EFESIM') return 'Efesim';
return 'Manuel';
}
return <>
<section className="dashboardGrid">
<div className="dashboardCard"><span>Aktif aday</span><strong>{items.length}</strong><small>Dönüşüm bekleyen müşteri</small></div>
<div className="dashboardCard"><span>Efesim</span><strong>{items.filter((x) => x.source === 'EFESIM').length}</strong><small>Efesim kaynaklı aday</small></div>
<div className="dashboardCard"><span>Google Maps</span><strong>{items.filter((x) => x.source === 'GOOGLE_MAPS').length}</strong><small>Google kaynaklı aday</small></div>
<div className="dashboardCard"><span>Ziyaretli</span><strong>{items.filter((x) => x._count.visits > 0).length}</strong><small>Sahada ziyaret edilmiş</small></div>
</section>
<section className="panel">
<div className="panelHeader"><div><h2>Potansiyel Müşteriler</h2><p>Sahadan gelen aday müşterileri incele ve uygun olanları gerçek bakım noktasına dönüştür.</p></div><button className="ghost iconAction" disabled={busy || loading} onClick={() => void load()}><AdminIcon name="refresh" size={17} /><span>YENİLE</span></button></div>
{error ? <div className="error banner">{error}</div> : null}
<div className="filterBar"><label className="searchField"><AdminIcon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Aday, SAP no, adres veya oluşturan ara" /></label><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}><option value="ALL">Tüm kaynaklar</option><option value="GOOGLE_MAPS">Google Maps</option><option value="MANUAL">Manuel</option><option value="EFESIM">Efesim</option></select><span className="filterCount">{visible.length} / {items.length}</span></div>
<div className="tableWrap"><table><thead><tr><th>Aday</th><th>Kaynak</th><th>SAP No</th><th>Konum</th><th>Oluşturan</th><th>Ziyaret</th><th></th></tr></thead><tbody>
{loading ? <tr><td colSpan={7}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Aday müşteriler yükleniyor</strong><span>Potansiyel müşteri listesi hazırlanıyor.</span></div></td></tr> : visible.length === 0 ? <tr><td colSpan={7}><div className="emptyState compact"><AdminIcon name="search" /><strong>Sonuç bulunamadı</strong><span>Arama veya kaynak filtresini değiştir.</span></div></td></tr> : visible.map((item) => <tr key={item.id}>
<td><strong>{item.name}</strong><div className="muted">{new Date(item.createdAt).toLocaleString('tr-TR')}</div></td>
<td><span className="pill">{sourceLabel(item.source)}</span></td>
<td>{item.sapNo || '—'}</td>
<td>{item.address || 'Adres yok'}<div className="muted">{String(item.latitude)}, {String(item.longitude)}</div></td>
<td>{item.createdBy.name}</td>
<td>{item._count.visits}</td>
<td className="actions"><button className="small" disabled={busy} onClick={() => void openHistory(item.id)}>GEÇMİŞ</button><button disabled={busy} onClick={() => void convert(item)}>NOKTAYA DÖNÜŞTÜR</button></td>
</tr>)}</tbody></table></div>
</section>
{history ? <section className="panel"><div className="panelHeader"><div><h2>{history.prospect.name} · Geçmiş</h2><p>{history.prospect.sapNo ? `SAP ${history.prospect.sapNo}` : 'SAP No yok'}</p></div><button className="ghost" onClick={() => setHistory(null)}>KAPAT</button></div><div className="tableWrap"><table><thead><tr><th>Tarih</th><th>Teknisyen</th><th>Amaç</th><th>Not</th></tr></thead><tbody>{history.prospect.visits.length === 0 ? <tr><td colSpan={4}>Henüz prospect ziyareti yok.</td></tr> : history.prospect.visits.map((visit) => <tr key={visit.id}><td>{new Date(visit.visitedAt).toLocaleString('tr-TR')}</td><td>{visit.technician.name}</td><td>{visit.purpose === 'SURVEY' ? 'Keşif' : 'Kurulum'}</td><td>{visit.note || '—'}</td></tr>)}</tbody></table></div>{history.audit.length ? <div className="muted">Audit: {history.audit.map((entry) => `${entry.action} · ${entry.actor?.name || '—'} · ${new Date(entry.createdAt).toLocaleString('tr-TR')}`).join(' | ')}</div> : null}</section> : null}
</>;
}
