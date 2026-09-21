'use client';

import { useEffect, useMemo, useState } from 'react';
import { AccessibleTable } from './accessible-table';

type Point = { id: string; code: string; name: string; status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED'; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; maintenanceWeek?: number | null; smartcleanReferenceAt?: string | null; address?: string | null; region?: { id: string; name: string } | null; aliases: Array<{ alias: string }> };
type Region = { id: string; name: string };
type Action = 'SET_REGION' | 'SET_STATUS' | 'SET_STANDARD_WEEK' | 'SET_SMARTCLEAN';


type BulkChange = { action: Action; week?: number; reference?: string; status?: Point['status']; regionName?: string };
type BulkOutcome = { updated: number; pointIds: string[]; action: Action };
const statusLabels = { ACTIVE: 'Aktif', PASSIVE: 'Pasif', CANCELLED: 'İptal' };
export function buildBulkPreview(point: Point, change: BulkChange) {
  if (change.action === 'SET_REGION') return [{ field: 'Bölge', before: point.region?.name ?? '—', after: change.regionName ?? '—' }];
  if (change.action === 'SET_STATUS') return [{ field: 'Durum', before: statusLabels[point.status], after: change.status ? statusLabels[change.status] : '—' }];
  return [
    { field: 'Bakım türü', before: point.maintenanceType === 'SMARTCLEAN' ? 'SmartClean' : 'Standart', after: change.action === 'SET_SMARTCLEAN' ? 'SmartClean' : 'Standart' },
    { field: 'Rut haftası', before: point.maintenanceWeek ? `Hafta ${point.maintenanceWeek}` : 'Ayar bekleyen', after: `Hafta ${change.week}` },
    { field: 'SmartClean referansı', before: point.smartcleanReferenceAt?.slice(0, 10) || '—', after: change.action === 'SET_STANDARD_WEEK' ? 'Temizlenecek' : change.reference || 'Eksik' },
  ];
}
export function parseBulkOutcome(value: unknown): BulkOutcome {
  const result = value as Partial<BulkOutcome> | null;
  if (!result || !Number.isInteger(result.updated) || (result.updated ?? -1) < 0 || !Array.isArray(result.pointIds) || result.pointIds.some((id) => typeof id !== 'string' || !id) || new Set(result.pointIds).size !== result.pointIds.length || result.updated !== result.pointIds.length || !['SET_REGION', 'SET_STATUS', 'SET_STANDARD_WEEK', 'SET_SMARTCLEAN'].includes(result.action ?? '')) throw new Error('İşlem sunucuya iletildi ancak sonuç doğrulanamadı. Yeniden uygulamadan önce İşlem Geçmişi ekranını kontrol edin.');
  return { updated: result.updated!, pointIds: result.pointIds, action: result.action! };
}
export async function readBulkResponse(response: Response, reset: () => void): Promise<BulkOutcome> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  reset();
  try { return parseBulkOutcome(await response.json()); }
  catch { throw new Error('İşlem sunucuya iletildi ancak sonuç doğrulanamadı. Yeniden uygulamadan önce İşlem Geçmişi ekranını kontrol edin.'); }
}
export function BulkPreviewTable({ points, change }: { points: Point[]; change: BulkChange }) {
  return <AccessibleTable caption="Seçili noktaların mevcut ve önerilen değerleri"><thead><tr><th>Nokta</th><th>Alan</th><th>Mevcut</th><th>Önerilen</th></tr></thead><tbody>{points.flatMap((point) => buildBulkPreview(point, change).map((row) => <tr key={`${point.id}-${row.field}`}><th scope="row">{point.code} · {point.name}</th><td>{row.field}</td><td>{row.before}</td><td>{row.after}</td></tr>))}</tbody></AccessibleTable>;
}
export function BulkAuditResult({ outcome }: { outcome: BulkOutcome }) {
  return <section className="panel" aria-label="Toplu işlem sonucu ve audit"><h2>İşlem Sonucu / Audit</h2><p role="status">{outcome.updated} nokta güncellendi. İşlem: <strong>{outcome.action}</strong></p><p>Audit kaydı: POINT_BULK_UPDATED. Ayrıntılar Sistem → İşlem Geçmişi ekranındadır.</p><details><summary>Sunucunun bildirdiği nokta kimlikleri ({outcome.pointIds.length})</summary><ul>{outcome.pointIds.map((id) => <li key={id}>{id}</li>)}</ul></details></section>;
}

export function invalidateForFilterChange() { return { selected: [], preview: false, confirmed: false }; }

export async function completeBulkMutation(
  mutate: () => Promise<void>,
  reset: () => void,
  reload: () => Promise<void>,
  warn: () => void,
): Promise<boolean> {
  await mutate();
  reset();
  try { await reload(); return true; } catch { warn(); return false; }
}

export default function BulkOperations() {
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [points, setPoints] = useState<Point[]>([]); const [regions, setRegions] = useState<Region[]>([]); const [selected, setSelected] = useState<string[]>([]); const [query, setQuery] = useState(''); const [statusFilter, setStatusFilter] = useState<'ALL' | Point['status']>('ALL'); const [action, setAction] = useState<Action>('SET_REGION'); const [regionId, setRegionId] = useState(''); const [status, setStatus] = useState<Point['status']>('ACTIVE'); const [week, setWeek] = useState('1'); const [reference, setReference] = useState(''); const [preview, setPreview] = useState(false); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [pointsLoaded, setPointsLoaded] = useState(false);
  const [regionsLoaded, setRegionsLoaded] = useState(false);
  const [pointsLoading, setPointsLoading] = useState(true);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [pointsError, setPointsError] = useState('');
  const [regionsError, setRegionsError] = useState('');
  async function loadPoints() {
    setPointsLoading(true); setPointsError(''); setPointsLoaded(false);
    try { const response = await fetch('/api/backend/points'); if (!response.ok) throw new Error(`HTTP ${response.status}`); setPoints(await response.json()); setPointsLoaded(true); }
    catch (cause) { setPointsError(cause instanceof Error ? cause.message : String(cause)); throw cause; }
    finally { setPointsLoading(false); }
  }
  async function loadRegions() {
    setRegionsLoading(true); setRegionsError(''); setRegionsLoaded(false);
    try { const response = await fetch('/api/backend/regions'); if (!response.ok) throw new Error(`HTTP ${response.status}`); const regionList = await response.json() as Region[]; setRegions(regionList); setRegionId(regionList[0]?.id ?? ''); setRegionsLoaded(true); }
    catch (cause) { setRegionsError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setRegionsLoading(false); }
  }
  useEffect(() => { void loadPoints().catch(() => {}); void loadRegions(); }, []);
  const visible = useMemo(() => points.filter((point) => { const text = [point.code, point.name, point.address, point.region?.name, ...point.aliases.map((item) => item.alias)].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR'); return (!query || text.includes(query.toLocaleLowerCase('tr-TR'))) && (statusFilter === 'ALL' || point.status === statusFilter); }), [points, query, statusFilter]);
  const chosen = useMemo(() => points.filter((point) => selected.includes(point.id)), [points, selected]);
  const target = action === 'SET_REGION' ? regions.find((region) => region.id === regionId)?.name : action === 'SET_STATUS' ? status : action === 'SET_STANDARD_WEEK' ? `Hafta ${week}` : `SmartClean / ${reference || 'referans tarihi eksik'}`;
  function clearPreview() { setPreview(false); setConfirmed(false); }
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); clearPreview(); }
  async function apply() { if (!preview || !confirmed || busy || !selected.length) return; const payload: Record<string, unknown> = { pointIds: selected, action }; if (action === 'SET_REGION') payload.regionId = regionId; if (action === 'SET_STATUS') payload.status = status; if (action === 'SET_STANDARD_WEEK') payload.maintenanceWeek = Number(week); if (action === 'SET_SMARTCLEAN') { payload.maintenanceWeek = Number(week); payload.smartcleanReferenceAt = reference; } let updatedCount = 0; setOutcome(null); setMessage(''); setBusy(true); try { const refreshed = await completeBulkMutation(async () => { const response = await fetch('/api/backend/points/bulk-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const result = await readBulkResponse(response, () => { setSelected([]); clearPreview(); }); updatedCount = result.updated; setOutcome(result); }, () => { setSelected([]); clearPreview(); }, loadPoints, () => setMessage(`${updatedCount} nokta güncellendi, ancak güncel liste yüklenemedi.`)); if (refreshed) setMessage(`${updatedCount} nokta için işlem tamamlandı.`); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  function changeFilter(change: () => void) { const safeState = invalidateForFilterChange(); change(); setSelected(safeState.selected); setPreview(safeState.preview); setConfirmed(safeState.confirmed); }
  if (!pointsLoaded || !regionsLoaded || pointsLoading || regionsLoading) return <section className="panel"><h2>Toplu İşlemler</h2>
    {pointsLoading || regionsLoading ? <p role="status">Toplu işlem verileri yükleniyor…</p> : null}
    {pointsError ? <div role="alert" className="error banner">Noktalar yüklenemedi · {pointsError}<button className="ghost" onClick={() => void loadPoints().catch(() => {})}>Noktaları yeniden dene</button></div> : null}
    {regionsError ? <div role="alert" className="error banner">Bölgeler yüklenemedi · {regionsError}<button className="ghost" onClick={() => void loadRegions()}>Bölgeleri yeniden dene</button></div> : null}
    {message ? <div className="banner">{message}</div> : null}{outcome ? <BulkAuditResult outcome={outcome} /> : null}
  </section>;
  return <section className="panel"><div className="panelHeader"><div><h2>Toplu İşlemler</h2><p>Birden fazla noktayı önizleme ve açık onay ile güncelleyin.</p></div><strong>{selected.length} nokta seçildi</strong></div>{message ? <div className="banner">{message}</div> : null}<div className="filterBar"><input value={query} onChange={(event) => changeFilter(() => setQuery(event.target.value))} placeholder="Kod, nokta, adres veya bölge ara" aria-label="Toplu işlem noktası ara" /><select value={statusFilter} onChange={(event) => changeFilter(() => setStatusFilter(event.target.value as 'ALL' | Point['status']))} aria-label="Nokta durum filtresi"><option value="ALL">Tüm durumlar</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select><span className="filterCount">{visible.length} / {points.length}</span></div><div className="filterBar"><select aria-label="Toplu işlem türü" value={action} onChange={(event) => { setAction(event.target.value as Action); clearPreview(); }}><option value="SET_REGION">Bölge değiştir</option><option value="SET_STATUS">Durum değiştir</option><option value="SET_STANDARD_WEEK">STANDARD rut haftası değiştir</option><option value="SET_SMARTCLEAN">SmartClean ayarla</option></select>{action === 'SET_REGION' ? <select aria-label="Hedef bölge" value={regionId} onChange={(event) => { setRegionId(event.target.value); clearPreview(); }}>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select> : null}{action === 'SET_STATUS' ? <select aria-label="Hedef durum" value={status} onChange={(event) => { setStatus(event.target.value as Point['status']); clearPreview(); }}><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select> : null}{action === 'SET_STANDARD_WEEK' || action === 'SET_SMARTCLEAN' ? <select aria-label="Hedef rut haftası" value={week} onChange={(event) => { setWeek(event.target.value); clearPreview(); }}><option value="1">Hafta 1</option><option value="2">Hafta 2</option></select> : null}{action === 'SET_SMARTCLEAN' ? <input type="date" aria-label="SmartClean referans tarihi" value={reference} onChange={(event) => { setReference(event.target.value); clearPreview(); }} /> : null}<button disabled={!selected.length} onClick={() => setPreview(true)}>Değişiklikleri Önizle</button></div><AccessibleTable caption="Toplu işlem için seçilebilir noktalar"><thead><tr><th>Seç</th><th>Kod</th><th>Nokta</th><th>Mevcut Bölge</th><th>Durum</th></tr></thead><tbody>{visible.length ? visible.map((point) => <tr key={point.id}><td><input type="checkbox" checked={selected.includes(point.id)} onChange={() => toggle(point.id)} aria-label={`${point.code} kodlu ${point.name} noktasını seç`} /></td><td>{point.code}</td><td>{point.name}</td><td>{point.region?.name ?? '—'}</td><td>{point.status}</td></tr>) : <tr><td colSpan={5}>Eşleşen nokta yok.</td></tr>}</tbody></AccessibleTable>{preview ? <section className="panel priorityPanel"><h2>Değişiklik Önizlemesi</h2><p>{chosen.length} nokta için yeni değer: <strong>{target}</strong>.</p><BulkPreviewTable points={chosen} change={{ action, week: Number(week), reference, status, regionName: regions.find((region) => region.id === regionId)?.name }} />{action === 'SET_REGION' ? <div className="banner">Bölge değişikliği yalnız organizasyon bilgisidir; mevcut konum verileri korunur ve yeniden konum araması çalışmaz.</div> : null}<label className="helpOption"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>Etkilenecek kayıtları ve yeni değeri kontrol ettim.</strong><small>İşlem audit altyapısında kayıtlı kalır.</small></span></label><button disabled={!confirmed || busy || (action === 'SET_SMARTCLEAN' && !reference)} onClick={() => void apply()}>Uygulamayı Onayla</button></section> : null}{outcome ? <BulkAuditResult outcome={outcome} /> : null}</section>;
}