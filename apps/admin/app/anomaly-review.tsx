'use client';
import { useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';
type Technician = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type ReviewItem = {
id: string;
performedAt: string;
recordedAtServer: string;
enteredLate: boolean;
suspiciousBatch: boolean;
reviewReason?: string | null;
locationLearningEligible: boolean;
locationReviewRequired: boolean;
locationPresenceConfirmed?: boolean | null;
latitude: string | number;
longitude: string | number;
accuracyMeters?: string | number | null;
technician: { id: string; name: string };
point: { id: string; code: string; name: string; regionId?: string | null; locationSource: string; locationConfidence: number; address?: string | null; canonicalLatitude?: string | number | null; canonicalLongitude?: string | number | null; googlePlaceId?: string | null; googleBusinessName?: string | null };
};
type ReviewDecision = 'NO_ISSUE' | 'KEEP_LOCATION_EXCLUDED' | 'NEEDS_FOLLOWUP';
export default function AnomalyReview() {
const [items, setItems] = useState<ReviewItem[]>([]);
const [technicians, setTechnicians] = useState<Technician[]>([]);
const [busy, setBusy] = useState(false);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [search, setSearch] = useState('');
async function api<T>(path: string, init?: RequestInit): Promise<T> {
const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
const body = await response.json().catch(() => null);
if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
return body as T;
}
async function load() {
setLoading(true);
try {
const [queue, users] = await Promise.all([
api<ReviewItem[]>('/api/backend/maintenance/review-queue?limit=200'),
api<Technician[]>('/api/backend/users'),
]);
setItems(queue);
setTechnicians(users.filter((user) => user.role === 'TECHNICIAN' && user.active));
} finally { setLoading(false); }
}
const visible = useMemo(() => { const q = search.trim().toLocaleLowerCase('tr-TR'); return items.filter((item) => !q || `${item.point.code} ${item.point.name} ${item.technician.name} ${item.reviewReason ?? ''}`.toLocaleLowerCase('tr-TR').includes(q)); }, [items, search]);
useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
async function scan(technicianId: string) {
setBusy(true); setError('');
try { await api(`/api/backend/maintenance/anomaly-scan?technicianId=${encodeURIComponent(technicianId)}&lookbackHours=24`, { method: 'POST' }); await load(); }
catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
async function scanAll() {
setBusy(true); setError('');
try {
for (const technician of technicians) await api(`/api/backend/maintenance/anomaly-scan?technicianId=${encodeURIComponent(technician.id)}&lookbackHours=24`, { method: 'POST' });
await load();
} catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
async function resolve(item: ReviewItem, decision: ReviewDecision) {
const labels: Record<ReviewDecision, string> = { NO_ISSUE: 'Sorun yok', KEEP_LOCATION_EXCLUDED: 'Kaydı koru / konumu öğrenme', NEEDS_FOLLOWUP: 'Takip gerekli' };
if (!window.confirm(`${item.point.name} için “${labels[decision]}” kararı verilsin mi?`)) return;
const note = window.prompt('Yönetici notu (opsiyonel):') ?? undefined;
setBusy(true); setError('');
try {
await api('/api/backend/maintenance/review-resolve', { method: 'POST', body: JSON.stringify({ visitId: item.id, decision, note }) });
await load();
} catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
async function approveLocation(item: ReviewItem) {
if (!window.confirm(`${item.point.name} için teknisyenin GPS konumu resmi nokta konumu olarak onaylansın mı? Bu işlem bakımı veya başka anomali bayraklarını kapatmaz.`)) return;
const note = window.prompt('Yönetici notu (opsiyonel):') ?? undefined;
setBusy(true); setError('');
try {
await api('/api/backend/maintenance/location-review/approve-visit', { method: 'POST', body: JSON.stringify({ visitId: item.id, note }) });
await load();
} catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
return <>
<section className="panel priorityPanel">
<div className="panelHeader"><div><h2>Bakım Anomalileri</h2><p>Şüpheli ardışık girişleri, uyumsuz seyahat sürelerini ve inceleme önerilen kayıtları yönet.</p></div><div className="actions"><span className="pill">{items.length} bekliyor</span><button className="ghost iconAction" onClick={() => void scanAll()} disabled={busy || loading || technicians.length === 0}><AdminIcon name="refresh" size={17} /><span>TÜMÜNÜ TARA</span></button></div></div>
{error ? <div className="error banner">{error}</div> : null}
<div className="filterBar oneFilter"><label className="searchField"><AdminIcon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nokta, müşteri no, teknisyen veya neden ara" /></label><span className="filterCount">{visible.length} / {items.length}</span></div>
<div className="tableWrap"><table><thead><tr><th>Nokta</th><th>Teknisyen</th><th>Neden</th><th>Konumlar</th><th>Zaman</th><th>Karar</th></tr></thead><tbody>
{loading ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Anomaliler yükleniyor</strong><span>İnceleme kuyruğu hazırlanıyor.</span></div></td></tr> : visible.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact success"><AdminIcon name="check" /><strong>İnceleme bekleyen kayıt yok</strong><span>Filtreye uyan açık anomali bulunmuyor.</span></div></td></tr> : visible.map((item) => <tr key={item.id}>
<td><strong>{item.point.name}</strong><div className="muted">{item.point.code} · {item.point.address || 'Adres yok'}</div></td>
<td>{item.technician.name}</td>
<td><span className="pill">{item.locationReviewRequired ? 'Konum incelemesi' : item.suspiciousBatch ? 'Şüpheli seri giriş' : 'İnceleme'}</span><div className="muted">{item.reviewReason || 'Neden belirtilmedi'}</div>{item.enteredLate ? <div className="muted">Geç giriş</div> : null}</td>
<td><strong>Mevcut:</strong> {item.point.canonicalLatitude == null ? 'Yok' : `${Number(item.point.canonicalLatitude).toFixed(5)}, ${Number(item.point.canonicalLongitude).toFixed(5)}`}<div className="muted"><strong>GPS:</strong> {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)} · {item.accuracyMeters == null ? 'hassasiyet yok' : `±${Math.round(Number(item.accuracyMeters))} m`}</div><div className="muted">{item.locationPresenceConfirmed ? 'Teknisyen: noktadayım' : 'Teknisyen: noktada değilim'}</div><div className="muted">{item.point.locationSource} · güven %{item.point.locationConfidence}{item.point.googleBusinessName ? ` · ${item.point.googleBusinessName}` : ''}</div></td>
<td>{new Date(item.recordedAtServer).toLocaleString('tr-TR')}</td>
<td className="actions">{item.locationReviewRequired ? <button className="small" disabled={busy} onClick={() => void approveLocation(item)}>TEKNİSYEN KONUMUNU ONAYLA</button> : null}<button className="small" disabled={busy} onClick={() => void resolve(item, 'NO_ISSUE')}>SORUN YOK</button><button className="small" disabled={busy} onClick={() => void resolve(item, 'KEEP_LOCATION_EXCLUDED')}>KONUMU DIŞLA</button><button className="small" disabled={busy} onClick={() => void resolve(item, 'NEEDS_FOLLOWUP')}>TAKİP</button></td>
</tr>)}</tbody></table></div>
</section>
<section className="panel"><div className="panelHeader"><div><h2>24 Saatlik Tarama</h2><p>Teknisyen bazında anomaly scan çalıştır.</p></div></div><div className="helpGrid">{technicians.map((technician) => <button className="helpOption" key={technician.id} onClick={() => void scan(technician.id)} disabled={busy}><span><strong>{technician.name}</strong><small>@{technician.username} · son 24 saat</small></span></button>)}</div></section>
</>;
}
