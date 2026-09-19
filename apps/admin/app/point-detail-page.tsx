'use client';

import { useEffect, useState } from 'react';
import type { AdminLocation, AdminSection } from './admin-navigation';

type Alias = { alias: string };
type Point = { id: string; code: string; name: string; sapName?: string | null; status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED'; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; maintenanceWeek?: number | null; smartcleanReferenceAt?: string | null; address?: string | null; region?: { name: string; technician?: { name: string } | null } | null; aliases?: Alias[]; locationSource?: string | null; locationConfidence?: number | null; canonicalLatitude?: number | null; canonicalLongitude?: number | null; googlePlaceId?: string | null; googleBusinessName?: string | null; coolerCount?: number | null; towerCount?: number | null; tapCount?: number | null; smarttapCount?: number | null };
type Props = { location: AdminLocation; onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void };
type RecordItem = Record<string, unknown>;

function asItems(data: unknown): RecordItem[] {
  if (Array.isArray(data)) return data.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object');
  if (data && typeof data === 'object') {
    const value = data as Record<string, unknown>;
    for (const key of ['items', 'history', 'events', 'assignments']) if (Array.isArray(value[key])) return value[key].filter((item): item is RecordItem => Boolean(item) && typeof item === 'object');
  }
  return [];
}
function shortValue(value: unknown) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }
function formatDateTime(value: unknown) {
  if (!value || typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function paperworkStatus(value: unknown) {
  const labels: Record<string, string> = { PENDING: 'Bekliyor', PRESENT: 'Mevcut', MISSING: 'Eksik' };
  return labels[String(value)] ?? shortValue(value);
}
function technicianName(item: RecordItem) {
  const technician = item.technician;
  return technician && typeof technician === 'object' && 'name' in technician ? shortValue((technician as RecordItem).name) : '—';
}
function paperworkChanges(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object') : [];
}
function maintenanceStatus(value: unknown) {
  const labels: Record<string, string> = { OPEN: 'Açık', COMPLETED: 'Tamamlandı', MISSED: 'Kaçırıldı', VALID: 'Geçerli', REVERSED: 'Geri alındı' };
  return labels[String(value)] ?? shortValue(value);
}
function obligationVisits(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object') : [];
}
function assignmentKind(value: unknown) {
  const labels: Record<string, string> = { POINT_OVERRIDE: 'Nokta istisnası', TEMPORARY: 'Geçici' };
  return labels[String(value)] ?? shortValue(value);
}
function timelineData(item: RecordItem) { return item.data && typeof item.data === 'object' ? item.data as RecordItem : {}; }
function timelineTitle(type: unknown) {
  const labels: Record<string, string> = { MAINTENANCE: 'Bakım ziyaretleri', ATTEMPT: 'Yapılamadı kaydı', NON_MAINTENANCE_VISIT: 'Bakım dışı ziyaret', OBLIGATION: 'Bakım yükümlülüğü', ASSIGNMENT: 'Atama değişikliği' };
  return labels[String(type)] ?? shortValue(type);
}
function timelineDetail(item: RecordItem) {
  const data = timelineData(item);
  if (item.type === 'MAINTENANCE') return `${technicianName(data)} · ${maintenanceStatus(data.status)}`;
  if (item.type === 'ATTEMPT') return `${technicianName(data)} · ${shortValue(data.reason)} · ${maintenanceStatus(data.reviewStatus)}`;
  if (item.type === 'NON_MAINTENANCE_VISIT') return `${technicianName(data)} · ${shortValue(data.purpose)}`;
  if (item.type === 'OBLIGATION') return `${shortValue(data.cycleKey)} · ${maintenanceStatus(data.status)}`;
  if (item.type === 'ASSIGNMENT') return `${technicianName(data)} · ${assignmentKind(data.kind)} · ${data.active === true ? 'Aktif' : 'Pasif'}`;
  return '—';
}

export default function PointDetailPage({ location, onNavigate }: Props) {
  const [point, setPoint] = useState<Point | null>(null);
  const [draft, setDraft] = useState<Point | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tabItems, setTabItems] = useState<RecordItem[]>([]);
  const [maintenanceTotals, setMaintenanceTotals] = useState<RecordItem | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const pointId = location.pointId;
  const activeTab = location.detailTab ?? 'general';
  async function load() { if (!pointId) return; setBusy(true); try { const response = await fetch(`/api/backend/points/${pointId}`); if (!response.ok) throw new Error(`HTTP ${response.status}`); const value = await response.json() as Point; setPoint(value); setDraft(value); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, [pointId]);
  useEffect(() => {
    if (!pointId) return;
    const endpoint = activeTab === 'maintenance' ? `/api/backend/maintenance/obligations/point/${pointId}/history`
      : activeTab === 'assignments' ? `/api/backend/assignments/point/${pointId}`
      : activeTab === 'paperwork' ? `/api/backend/maintenance/point/${pointId}/paperwork-history`
      : activeTab === 'timeline' ? `/api/backend/maintenance/point-timeline?pointId=${encodeURIComponent(pointId)}`
      : activeTab === 'audit' ? `/api/backend/audit?entityId=${encodeURIComponent(pointId)}` : '';
    if (!endpoint) { setTabItems([]); setMaintenanceTotals(null); return; }
    let cancelled = false; setTabLoading(true); setTabItems([]); setMaintenanceTotals(null);
    void fetch(endpoint).then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }).then((data) => { if (!cancelled) { setTabItems(asItems(data)); if (activeTab === 'maintenance' && data && typeof data === 'object' && 'totals' in data && (data as Record<string, unknown>).totals && typeof (data as Record<string, unknown>).totals === 'object') setMaintenanceTotals((data as Record<string, unknown>).totals as RecordItem); } }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => { if (!cancelled) setTabLoading(false); });
    return () => { cancelled = true; };
  }, [pointId, activeTab]);
  async function save() { if (!point || !draft) return; setBusy(true); try { const payload = Object.fromEntries(Object.entries({ name: draft.name, status: draft.status, maintenanceType: draft.maintenanceType, maintenanceWeek: draft.maintenanceWeek, smartcleanReferenceAt: draft.smartcleanReferenceAt }).filter(([key, value]) => point[key as keyof Point] !== value)); if (!Object.keys(payload).length) { setEditing(false); return; } const response = await fetch(`/api/backend/points/${point.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); setEditing(false); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  if (!pointId) return <section className="panel"><div className="emptyState"><strong>Nokta seçilmedi</strong><span>Liste ekranından bir Detay bağlantısı açın.</span></div></section>;
  if (!point) return <section className="panel"><div className="emptyState"><strong>{busy ? 'Nokta yükleniyor' : 'Nokta bulunamadı'}</strong>{error ? <span>{error}</span> : null}</div></section>;
  const value = draft ?? point;
  const navigateTab = (detailTab: string) => onNavigate('point-detail', { pointId, detailTab, query: location.query });
  const rows = activeTab === 'location' ? [['Adres', point.address], ['Canonical latitude', point.canonicalLatitude], ['Canonical longitude', point.canonicalLongitude], ['Konum kaynağı', point.locationSource], ['Güven', point.locationConfidence === null || point.locationConfidence === undefined ? null : `${point.locationConfidence}%`], ['Google Place ID', point.googlePlaceId], ['Google işletme adı', point.googleBusinessName]] : activeTab === 'equipment' ? [['Soğutucu', point.coolerCount], ['Kule', point.towerCount], ['Musluk', point.tapCount], ['SmartTap', point.smarttapCount]] : [['Kod', point.code], ['Nokta adı', point.name], ['SAP adı', point.sapName], ['Alias', point.aliases?.map((item) => item.alias).join(', ')], ['Bölge', point.region?.name], ['Durum', point.status], ['Bakım tipi', point.maintenanceType], ['Rut haftası', point.maintenanceWeek], ['SmartClean referansı', point.smartcleanReferenceAt]];
  const dataTab = ['maintenance', 'assignments', 'audit'].includes(activeTab);
  if (activeTab === 'timeline') return <section className="panel"><div className="panelHeader"><div><h2>{point.name}</h2><p>{point.code} · Tüm operasyon olayları zaman sırasıyla gösterilir.</p></div><div className="rowActions">{editing ? <><button className="ghost" onClick={() => { setDraft(point); setEditing(false); }}>İptal</button><button disabled={busy} onClick={() => void save()}>Kaydet</button></> : <button onClick={() => setEditing(true)}>Düzenle</button>}</div></div>{error ? <div className="error banner">{error}</div> : null}<div className="detailTabs" role="tablist">{[['general', 'Genel Bilgiler'], ['location', 'Konum'], ['maintenance', 'Bakım'], ['assignments', 'Görevlendirme'], ['equipment', 'Ekipman'], ['paperwork', 'Evrak'], ['timeline', 'Timeline'], ['audit', 'Audit / Geçmiş']].map(([id, label]) => <button key={id} role="tab" aria-selected={activeTab === id} onClick={() => navigateTab(id)}>{label}</button>)}</div><div className="tableWrap"><table><thead><tr><th>Zaman</th><th>Olay</th><th>Detay</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={3}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => <tr key={String(item.id ?? index)}><td>{formatDateTime(item.at)}</td><td><strong>{timelineTitle(item.type)}</strong></td><td>{timelineDetail(item)}</td></tr>) : <tr><td colSpan={3}>Bu nokta için timeline kaydı yok.</td></tr>}</tbody></table></div></section>;
  return <section className="panel"><div className="panelHeader"><div><h2>{point.name}</h2><p>{point.code} · {point.region?.name ?? 'Bölge yok'} · {point.locationSource ?? 'UNKNOWN'} / {point.locationConfidence ?? 0}%</p></div><div className="rowActions">{editing ? <><button className="ghost" onClick={() => { setDraft(point); setEditing(false); }}>İptal</button><button disabled={busy} onClick={() => void save()}>Kaydet</button></> : <button onClick={() => setEditing(true)}>Düzenle</button>}</div></div>{error ? <div className="error banner">{error}</div> : null}<div className="detailTabs" role="tablist">{[['general', 'Genel Bilgiler'], ['location', 'Konum'], ['maintenance', 'Bakım'], ['assignments', 'Görevlendirme'], ['equipment', 'Ekipman'], ['paperwork', 'Evrak'], ['timeline', 'Timeline'], ['audit', 'Audit / Geçmiş']].map(([id, label]) => <button key={id} role="tab" aria-selected={activeTab === id} onClick={() => navigateTab(id)}>{label}</button>)}</div>{activeTab === 'maintenance' ? <><div className="metricGrid"><div className="metricCard"><span>Açık yükümlülük</span><strong>{shortValue(maintenanceTotals?.open)}</strong></div><div className="metricCard"><span>Tamamlanan</span><strong>{shortValue(maintenanceTotals?.completed)}</strong></div><div className="metricCard"><span>Kaçırılan</span><strong>{shortValue(maintenanceTotals?.missed)}</strong></div></div><div className="tableWrap"><table><thead><tr><th>Dönem</th><th>Vade aralığı</th><th>Durum</th><th>Tamamlanma</th><th>Gerçekleşen ziyaretler</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={5}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => { const visits = obligationVisits(item.visits); return <tr key={String(item.id ?? index)}><td>{shortValue(item.cycleKey)}</td><td>{formatDateTime(item.dueStart)} – {formatDateTime(item.dueEnd)}</td><td>{maintenanceStatus(item.status)}</td><td>{formatDateTime(item.completedAt)}</td><td>{visits.length ? <details><summary>{visits.length} ziyaret</summary>{visits.map((visit, visitIndex) => <div key={String(visit.id ?? visitIndex)}>{formatDateTime(visit.performedAt)} · {maintenanceStatus(visit.status)}</div>)}</details> : 'Ziyaret yok'}</td></tr>; }) : <tr><td colSpan={5}>Bu nokta için bakım yükümlülüğü yok.</td></tr>}</tbody></table></div></> : activeTab === 'assignments' ? <div className="tableWrap"><table><thead><tr><th>Teknisyen</th><th>Görevlendirme türü</th><th>Başlangıç</th><th>Bitiş</th><th>Aktiflik</th><th>Not</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={6}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => <tr key={String(item.id ?? index)}><td>{technicianName(item)}</td><td>{assignmentKind(item.kind)}</td><td>{formatDateTime(item.startsAt)}</td><td>{formatDateTime(item.endsAt)}</td><td>{item.active === true ? 'Aktif' : 'Pasif'}</td><td>{shortValue(item.reason)}</td></tr>) : <tr><td colSpan={6}>Bu nokta için görevlendirme geçmişi yok.</td></tr>}</tbody></table></div> : activeTab === 'paperwork' ? <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>Teknisyen</th><th>Evrak durumu</th><th>Servis fişi</th><th>Teyit</th><th>Değişiklik geçmişi</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={6}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => <tr key={String(item.id ?? index)}><td>{formatDateTime(item.performedAt ?? item.recordedAtServer)}</td><td>{technicianName(item)}</td><td>{paperworkStatus(item.status)}</td><td>{paperworkStatus(item.serviceSlipStatus)}</td><td>{paperworkStatus(item.confirmationStatus)}</td><td>{paperworkChanges(item.paperworkHistory).length ? <details><summary>{paperworkChanges(item.paperworkHistory).length} değişiklik</summary>{paperworkChanges(item.paperworkHistory).map((change, changeIndex) => <div key={String(change.id ?? changeIndex)}>{formatDateTime(change.changedAt)} · {shortValue(change.kind)} · {paperworkStatus(change.previousStatus)} → {paperworkStatus(change.newStatus)}</div>)}</details> : 'Değişiklik yok'}</td></tr>) : <tr><td colSpan={6}>Bu nokta için evrak kaydı yok.</td></tr>}</tbody></table></div> : dataTab ? <div className="tableWrap"><table><thead><tr><th>Kayıt</th><th>Detay</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={2}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => <tr key={String(item.id ?? index)}><td><strong>{shortValue(item.status ?? item.type ?? item.period ?? item.performedAt ?? item.createdAt ?? index + 1)}</strong></td><td>{Object.entries(item).filter(([key]) => key !== 'id').map(([key, itemValue]) => <div key={key}><span className="muted">{key}: </span>{shortValue(itemValue)}</div>)}</td></tr>) : <tr><td colSpan={2}>Bu sekme için kayıt yok.</td></tr>}</tbody></table></div> : <div className="tableWrap"><table><tbody>{rows.map(([label, itemValue]) => <tr key={label}><th>{label}</th><td>{editing && label === 'Nokta adı' ? <input value={value.name} onChange={(event) => setDraft({ ...value, name: event.target.value })} /> : editing && label === 'Durum' ? <select value={value.status} onChange={(event) => setDraft({ ...value, status: event.target.value as Point['status'] })}><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select> : editing && label === 'Bakım tipi' ? <select value={value.maintenanceType} onChange={(event) => setDraft({ ...value, maintenanceType: event.target.value as Point['maintenanceType'] })}><option value="STANDARD">STANDARD</option><option value="SMARTCLEAN">SMARTCLEAN</option></select> : editing && label === 'Rut haftası' ? <input type="number" min="1" max="53" value={value.maintenanceWeek ?? ''} onChange={(event) => setDraft({ ...value, maintenanceWeek: event.target.value ? Number(event.target.value) : null })} /> : shortValue(itemValue)}</td></tr>)}</tbody></table></div>}</section>;
}
