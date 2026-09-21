'use client';

import { FormEvent, KeyboardEvent, useEffect, useState } from 'react';
import type { AdminLocation, AdminSection } from './admin-navigation';

type Alias = { id?: string; alias: string; createdAt?: string; createdBy?: { id: string; name: string } };
type Region = { id: string; name: string };
type Point = { id: string; code: string; name: string; sapName?: string | null; status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED'; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; maintenanceWeek?: number | null; smartcleanReferenceAt?: string | null; address?: string | null; region?: { id: string; name: string; technician?: { name: string } | null } | null; aliases?: Alias[]; locationSource?: string | null; locationConfidence?: number | null; canonicalLatitude?: number | null; canonicalLongitude?: number | null; googlePlaceId?: string | null; googleBusinessName?: string | null; coolerCount?: number | null; towerCount?: number | null; tapCount?: number | null; smarttapCount?: number | null };
type EffectiveAssignment = { technician?: { name?: string | null } | null };
type Props = { location: AdminLocation; onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void };
type RecordItem = Record<string, unknown>;
const detailTabs = [['general', 'Genel Bilgiler'], ['location', 'Konum'], ['maintenance', 'Bakım'], ['assignments', 'Görevlendirme'], ['equipment', 'Ekipman'], ['paperwork', 'Evrak'], ['timeline', 'Timeline'], ['audit', 'Audit / Geçmiş']] as const;

function DetailTabs({ activeTab, onNavigate }: { activeTab: string; onNavigate: (tab: string) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? detailTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + detailTabs.length) % detailTabs.length;
    onNavigate(detailTabs[nextIndex][0]);
    requestAnimationFrame(() => document.getElementById(`point-detail-tab-${detailTabs[nextIndex][0]}`)?.focus());
  }
  return <><div className="rowActions"><button className="ghost" onClick={() => onNavigate('points')}>Geri dön: Noktalar</button></div><div className="detailTabs" role="tablist" aria-label="Nokta detay bölümleri">{detailTabs.map(([id, label], index) => <button key={id} id={`point-detail-tab-${id}`} role="tab" aria-controls={`point-detail-panel-${id}`} aria-selected={activeTab === id} tabIndex={activeTab === id ? 0 : -1} onKeyDown={(event) => onKeyDown(event, index)} onClick={() => onNavigate(id)}>{label}</button>)}</div></>;
}

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
  const labels: Record<string, string> = { PENDING: 'Bekliyor', PRESENT: 'Mevcut', MISSING: 'Eksik', PENDING_REVIEW: 'İnceleme bekliyor', APPROVED: 'Onaylandı' };
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
function scheduleWeekValue(value: number | null | undefined) { return value === 1 || value === 2 ? String(value) : ''; }
function obligationVisits(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is RecordItem => Boolean(item) && typeof item === 'object') : [];
}
function assignmentKind(value: unknown) {
  const labels: Record<string, string> = { POINT_OVERRIDE: 'Nokta istisnası', TEMPORARY: 'Geçici' };
  return labels[String(value)] ?? shortValue(value);
}
function auditActor(item: RecordItem) {
  const actor = item.actor;
  if (!actor || typeof actor !== 'object') return 'Sistem / bilinmiyor';
  const value = actor as RecordItem;
  return shortValue(value.name ?? value.username ?? value.id);
}
function auditAction(value: unknown) {
  return shortValue(value).replaceAll('_', ' ');
}
function timelineData(item: RecordItem) { return item.data && typeof item.data === 'object' ? item.data as RecordItem : {}; }
function timelineTitle(type: unknown) {
  const labels: Record<string, string> = { MAINTENANCE: 'Bakım ziyaretleri', ATTEMPT: 'Yapılamadı kaydı', NON_MAINTENANCE_VISIT: 'Bakım dışı ziyaret', OBLIGATION: 'Bakım yükümlülüğü', ASSIGNMENT: 'Atama değişikliği' };
  return labels[String(type)] ?? shortValue(type);
}
function timelineDetail(item: RecordItem) {
  const data = timelineData(item);
  if (item.type === 'MAINTENANCE') {
    const partialMaintenance = typeof data.totalCoolerCount === 'number' && typeof data.maintainedCoolerCount === 'number' ? ` · Soğutucu ${data.maintainedCoolerCount}/${data.totalCoolerCount}${typeof data.missingMaintenanceCount === 'number' && data.missingMaintenanceCount > 0 ? ` · ${data.missingMaintenanceCount} eksik` : ''}` : '';
    return `${technicianName(data)} · ${maintenanceStatus(data.status)}${partialMaintenance}`;
  }
  if (item.type === 'ATTEMPT') return `${technicianName(data)} · ${shortValue(data.reason)} · ${maintenanceStatus(data.reviewStatus)}`;
  if (item.type === 'NON_MAINTENANCE_VISIT') return `${technicianName(data)} · ${shortValue(data.purpose)}`;
  if (item.type === 'OBLIGATION') return `${shortValue(data.cycleKey)} · ${maintenanceStatus(data.status)}`;
  if (item.type === 'ASSIGNMENT') return `${technicianName(data)} · ${assignmentKind(data.kind)} · ${data.active === true ? 'Aktif' : 'Pasif'}`;
  return '—';
}

export default function PointDetailPage({ location, onNavigate: navigate }: Props) {
  const onNavigate: Props['onNavigate'] = (section, values = {}) => navigate(section, section === 'points' ? { query: location.query, status: location.status, region: location.region, maintenanceType: location.maintenanceType, page: location.page, scrollY: location.scrollY, ...values } : values);
  const [point, setPoint] = useState<Point | null>(null);
  const [draft, setDraft] = useState<Point | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [aliasDraft, setAliasDraft] = useState('');
  const [aliasBusy, setAliasBusy] = useState(false);
  const [tabItems, setTabItems] = useState<RecordItem[]>([]);
  const [maintenanceTotals, setMaintenanceTotals] = useState<RecordItem | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [effectiveAssignment, setEffectiveAssignment] = useState<EffectiveAssignment | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecordItem[] | null>(null);
  const [activityError, setActivityError] = useState('');
  useEffect(() => {
    if (!location.pointId) return;
    let cancelled = false;
    setRecentActivity(null); setActivityError('');
    void fetch(`/api/backend/maintenance/point-timeline?pointId=${encodeURIComponent(location.pointId)}`)
      .then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(data => { if (!cancelled) setRecentActivity(asItems(data).filter(item => typeof item.at === 'string' && !Number.isNaN(Date.parse(item.at)) && Date.parse(item.at) <= Date.now()).sort((a, b) => Date.parse(String(b.at)) - Date.parse(String(a.at))).slice(0, 1)); })
      .catch(cause => { if (!cancelled) setActivityError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [location.pointId]);
  const pointId = location.pointId;
  const activeTab = location.detailTab ?? 'general';
  async function load() { if (!pointId) return; setBusy(true); try { const response = await fetch(`/api/backend/points/${pointId}`); if (!response.ok) throw new Error(`HTTP ${response.status}`); const value = await response.json() as Point; setPoint(value); setDraft(value); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  async function loadAliases() { if (!pointId) return; const response = await fetch(`/api/backend/points/${pointId}/aliases`); if (!response.ok) throw new Error(`HTTP ${response.status}`); setAliases(await response.json() as Alias[]); }
  useEffect(() => { void load(); }, [pointId]);
  useEffect(() => { void loadAliases().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))); }, [pointId]);
  useEffect(() => { if (!pointId) return; let cancelled = false; void fetch(`/api/backend/assignments/effective/${pointId}`).then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<EffectiveAssignment>; }).then((assignment) => { if (!cancelled) setEffectiveAssignment(assignment); }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }); return () => { cancelled = true; }; }, [pointId]);
  useEffect(() => {
    if (!editing || activeTab !== 'general') return;
    void fetch('/api/backend/regions').then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<Region[]>;
    }).then(setRegions).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [editing, activeTab]);
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
  async function addAlias(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pointId || !aliasDraft.trim()) return;
    setAliasBusy(true); setError('');
    try {
      const response = await fetch(`/api/backend/points/${pointId}/aliases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: aliasDraft.trim() }) });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`); }
      setAliasDraft('');
      await loadAliases();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setAliasBusy(false); }
  }
  async function save() { if (!point || !draft) return; setBusy(true); try { const scheduleTouched = point.maintenanceWeek !== draft.maintenanceWeek || point.smartcleanReferenceAt !== draft.smartcleanReferenceAt; if (scheduleTouched && !scheduleWeekValue(draft.maintenanceWeek)) { setError('Rut haftası yalnızca 1 veya 2 olabilir.'); return; } if (scheduleTouched && draft.maintenanceType === 'SMARTCLEAN' && !draft.smartcleanReferenceAt) { setError('SmartClean referans tarihi zorunludur.'); return; } const payload = Object.fromEntries(Object.entries({ name: draft.name, status: draft.status, regionId: draft.region?.id, maintenanceWeek: draft.maintenanceWeek, smartcleanReferenceAt: draft.smartcleanReferenceAt }).filter(([key, value]) => key === 'regionId' ? value !== point.region?.id : point[key as keyof Point] !== value)); if (!Object.keys(payload).length) { setEditing(false); return; } const response = await fetch(`/api/backend/points/${point.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); setEditing(false); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  if (!pointId) return <section className="panel"><div className="emptyState"><strong>Nokta seçilmedi</strong><span>Liste ekranından bir Detay bağlantısı açın.</span></div></section>;
  if (!point) return <section className="panel"><div className="emptyState"><strong>{busy ? 'Nokta yükleniyor' : 'Nokta bulunamadı'}</strong>{error ? <span>{error}</span> : null}</div></section>;
  const value = draft ?? point;
  const returnToPoints = () => onNavigate('points', { query: location.query, status: location.status, region: location.region, maintenanceType: location.maintenanceType, page: location.page, scrollY: location.scrollY });
  const navigateTab = (detailTab: string) => detailTab === 'points' ? returnToPoints() : onNavigate('point-detail', { pointId, detailTab, query: location.query, status: location.status, region: location.region, maintenanceType: location.maintenanceType, page: location.page, scrollY: location.scrollY });
  const header = <section className="pointIdentity" aria-label="Nokta kimliği ve durum">
    <div className="panelHeader"><div><h2>{point.name}</h2><p>{point.code} · {point.region?.name ?? 'Bölge yok'}</p></div>
      <div className="rowActions"><button className="ghost" onClick={() => returnToPoints()}>Geri dön: Noktalar</button>{editing ? <><button className="ghost" onClick={() => { setDraft(point); setEditing(false); }}>İptal</button><button disabled={busy} onClick={() => void save()}>Kaydet</button></> : <button onClick={() => { setDraft(point); setEditing(true); if (activeTab !== 'general' && activeTab !== 'maintenance') navigateTab('general'); }}>Düzenle</button>}</div>
    </div>
    <div className="pointIdentityFacts"><span className={point.status === 'ACTIVE' ? 'pill active' : 'pill'}>{point.status === 'ACTIVE' ? 'Aktif' : point.status === 'PASSIVE' ? 'Pasif' : 'İptal'}</span><span><strong>Bakım tipi:</strong> {point.maintenanceType}</span><span><strong>Geçerli teknisyen:</strong> <span>{effectiveAssignment ? effectiveAssignment.technician?.name ?? 'Atanmamış' : 'Yükleniyor…'}</span></span><span><strong>Konum:</strong> {point.locationSource ?? 'UNKNOWN'} / {point.locationConfidence === null || point.locationConfidence === undefined ? '—' : `${point.locationConfidence}%`}</span></div>
    <div className="pointAliases" aria-label="Nokta aliasları">{aliases.map((alias, index) => <span className="pill" key={alias.id ?? index}>{alias.alias}</span>)}</div>
    <p className="muted" aria-live="polite">Son hareket: {activityError ? `Yüklenemedi · ${activityError}` : recentActivity === null ? 'Yükleniyor…' : recentActivity.length ? `${timelineTitle(recentActivity[0].type)} · ${formatDateTime(recentActivity[0].at)}` : 'Kayıt yok'}</p>
  </section>;
  const rows = activeTab === 'location' ? [['Adres', point.address], ['Canonical latitude', point.canonicalLatitude], ['Canonical longitude', point.canonicalLongitude], ['Konum kaynağı', point.locationSource], ['Güven', point.locationConfidence === null || point.locationConfidence === undefined ? null : `${point.locationConfidence}%`], ['Google Place ID', point.googlePlaceId], ['Google işletme adı', point.googleBusinessName]] : activeTab === 'equipment' ? [['Soğutucu', point.coolerCount], ['Kule', point.towerCount], ['Musluk', point.tapCount], ['SmartTap', point.smarttapCount]] : [['Kod', point.code], ['Nokta adı', point.name], ['SAP adı', point.sapName], ['Alias', aliases.map((item) => item.alias).join(', ')], ['Bölge', point.region?.name], ['Durum', point.status]];
  if (activeTab === 'general') return <section className="panel" id="point-detail-panel-general" role="tabpanel" aria-labelledby="point-detail-tab-general">{header}{error ? <div className="error banner" role="alert">{error}</div> : null}<DetailTabs activeTab={activeTab} onNavigate={navigateTab} /><div className="tableWrap"><table><tbody>{rows.map(([label, itemValue]) => <tr key={label}><th>{label}</th><td>{editing && label === 'Nokta adı' ? <input value={value.name} onChange={(event) => setDraft({ ...value, name: event.target.value })} aria-label="Nokta adı" /> : editing && label === 'Bölge' ? <select value={value.region?.id ?? ''} onChange={(event) => setDraft({ ...value, region: regions.find((region) => region.id === event.target.value) })} aria-label="Bölge"><option value="" disabled>Bölge seçin</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select> : editing && label === 'Durum' ? <select value={value.status} onChange={(event) => setDraft({ ...value, status: event.target.value as Point['status'] })} aria-label="Durum"><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select> : shortValue(itemValue)}</td></tr>)}</tbody></table></div>{editing ? <form className="pointDetailAliasForm" onSubmit={(event) => void addAlias(event)}><div><label htmlFor="point-alias">Yeni alias</label><p id="point-alias-help">Arama için alternatif ad ekleyin. Mevcut aliaslar bu ekranda silinemez veya değiştirilemez.</p></div><input id="point-alias" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} minLength={2} maxLength={160} required aria-describedby="point-alias-help" /><button type="submit" disabled={aliasBusy}>{aliasBusy ? 'EKLENİYOR...' : 'Alias ekle'}</button></form> : null}</section>;
  if (activeTab === 'audit') return <section className="panel" id="point-detail-panel-audit" role="tabpanel" aria-labelledby="point-detail-tab-audit">{header}{error ? <div className="error banner" role="alert">{error}</div> : null}<DetailTabs activeTab={activeTab} onNavigate={navigateTab} /><div className="tableWrap"><table><thead><tr><th>İşlem zamanı</th><th>İşlem</th><th>İşlemi yapan</th><th>Not</th><th>Değişen alanlar</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={5}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => <tr key={String(item.id ?? index)}><td>{formatDateTime(item.createdAt)}</td><td><strong>{auditAction(item.action)}</strong></td><td>{auditActor(item)}</td><td>{shortValue(item.note)}</td><td>{item.oldValue !== null || item.newValue !== null ? <details><summary>Önce / sonra</summary><div><span className="muted">Önce: </span>{shortValue(item.oldValue)}</div><div><span className="muted">Sonra: </span>{shortValue(item.newValue)}</div></details> : 'Alan değişikliği yok'}</td></tr>) : <tr><td colSpan={5}>Bu nokta için audit kaydı yok.</td></tr>}</tbody></table></div></section>;
  if (activeTab === 'timeline') return <section className="panel" id="point-detail-panel-timeline" role="tabpanel" aria-labelledby="point-detail-tab-timeline">{header}{error ? <div className="error banner" role="alert">{error}</div> : null}<DetailTabs activeTab={activeTab} onNavigate={navigateTab} /><div className="tableWrap"><table><thead><tr><th>Zaman</th><th>Olay</th><th>Detay</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={3}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => <tr key={String(item.id ?? index)}><td>{formatDateTime(item.at)}</td><td><strong>{timelineTitle(item.type)}</strong></td><td>{timelineDetail(item)}</td></tr>) : <tr><td colSpan={3}>Bu nokta için timeline kaydı yok.</td></tr>}</tbody></table></div></section>;
  return <section className="panel" id={`point-detail-panel-${activeTab}`} role="tabpanel" aria-labelledby={`point-detail-tab-${activeTab}`}>{header}{error ? <div className="error banner" role="alert">{error}</div> : null}<DetailTabs activeTab={activeTab} onNavigate={navigateTab} />{activeTab === 'maintenance' ? <><section className="panel priorityPanel"><h3>Bakım ayarları</h3><p>Bakım tipi değiştirilmez; yalnızca bu noktanın geçerli hafta ve SmartClean referansı düzeltilir.</p><div className="tableWrap"><table><tbody><tr><th>Bakım tipi</th><td>{point.maintenanceType}</td></tr><tr><th>Rut haftası</th><td>{editing ? <select value={scheduleWeekValue(value.maintenanceWeek)} onChange={(event) => setDraft({ ...value, maintenanceWeek: Number(event.target.value) })} aria-label="Rut haftası"><option value="" disabled>Rut haftası seçin</option><option value="1">Hafta 1</option><option value="2">Hafta 2</option></select> : shortValue(point.maintenanceWeek)}</td></tr>{point.maintenanceType === 'SMARTCLEAN' ? <tr><th>SmartClean referansı</th><td>{editing ? <input type="date" value={value.smartcleanReferenceAt?.slice(0, 10) ?? ''} onChange={(event) => setDraft({ ...value, smartcleanReferenceAt: event.target.value })} aria-label="SmartClean referans tarihi" /> : shortValue(point.smartcleanReferenceAt)}</td></tr> : null}</tbody></table></div></section><div className="metricGrid"><div className="metricCard"><span>Açık yükümlülük</span><strong>{shortValue(maintenanceTotals?.open)}</strong></div><div className="metricCard"><span>Tamamlanan</span><strong>{shortValue(maintenanceTotals?.completed)}</strong></div><div className="metricCard"><span>Kaçırılan</span><strong>{shortValue(maintenanceTotals?.missed)}</strong></div></div><div className="tableWrap"><table><thead><tr><th>Dönem</th><th>Vade aralığı</th><th>Durum</th><th>Tamamlanma</th><th>Gerçekleşen ziyaretler</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={5}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => { const visits = obligationVisits(item.visits); return <tr key={String(item.id ?? index)}><td>{shortValue(item.cycleKey)}</td><td>{formatDateTime(item.dueStart)} – {formatDateTime(item.dueEnd)}</td><td>{maintenanceStatus(item.status)}</td><td>{formatDateTime(item.completedAt)}</td><td>{visits.length ? <details><summary>{visits.length} ziyaret</summary>{visits.map((visit, visitIndex) => <div key={String(visit.id ?? visitIndex)}>{formatDateTime(visit.performedAt)} · {maintenanceStatus(visit.status)}</div>)}</details> : 'Ziyaret yok'}</td></tr>; }) : <tr><td colSpan={5}>Bu nokta için bakım yükümlülüğü yok.</td></tr>}</tbody></table></div></> : activeTab === 'assignments' ? <div className="tableWrap"><table><thead><tr><th>Teknisyen</th><th>Görevlendirme türü</th><th>Başlangıç</th><th>Bitiş</th><th>Aktiflik</th><th>Not</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={6}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => <tr key={String(item.id ?? index)}><td>{technicianName(item)}</td><td>{assignmentKind(item.kind)}</td><td>{formatDateTime(item.startsAt)}</td><td>{formatDateTime(item.endsAt)}</td><td>{item.active === true ? 'Aktif' : 'Pasif'}</td><td>{shortValue(item.reason)}</td></tr>) : <tr><td colSpan={6}>Bu nokta için görevlendirme geçmişi yok.</td></tr>}</tbody></table></div> : activeTab === 'paperwork' ? <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>Teknisyen</th><th>Evrak durumu</th><th>Servis fişi</th><th>Teyit</th><th>Değişiklik geçmişi</th></tr></thead><tbody>{tabLoading ? <tr><td colSpan={6}>Yükleniyor…</td></tr> : tabItems.length ? tabItems.map((item, index) => <tr key={String(item.id ?? index)}><td>{formatDateTime(item.performedAt ?? item.recordedAtServer)}</td><td>{technicianName(item)}</td><td>{paperworkStatus(item.status)}</td><td>{paperworkStatus(item.serviceSlipStatus)}</td><td>{paperworkStatus(item.confirmationStatus)}</td><td>{paperworkChanges(item.paperworkHistory).length ? <details><summary>{paperworkChanges(item.paperworkHistory).length} değişiklik</summary>{paperworkChanges(item.paperworkHistory).map((change, changeIndex) => <div key={String(change.id ?? changeIndex)}>{formatDateTime(change.changedAt)} · {shortValue(change.kind)} · {paperworkStatus(change.previousStatus)} → {paperworkStatus(change.newStatus)}</div>)}</details> : 'Değişiklik yok'}</td></tr>) : <tr><td colSpan={6}>Bu nokta için evrak kaydı yok.</td></tr>}</tbody></table></div> : <div className="tableWrap"><table><tbody>{rows.map(([label, itemValue]) => <tr key={label}><th>{label}</th><td>{editing && label === 'Nokta adı' ? <input value={value.name} onChange={(event) => setDraft({ ...value, name: event.target.value })} aria-label="Nokta adı" /> : editing && label === 'Bölge' ? <select value={value.region?.id ?? ''} onChange={(event) => setDraft({ ...value, region: regions.find((region) => region.id === event.target.value) })} aria-label="Bölge"><option value="" disabled>Bölge seçin</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select> : editing && label === 'Durum' ? <select value={value.status} onChange={(event) => setDraft({ ...value, status: event.target.value as Point['status'] })} aria-label="Durum"><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select> : shortValue(itemValue)}</td></tr>)}</tbody></table></div>}{activeTab === 'general' && editing ? <form className="pointDetailAliasForm" onSubmit={(event) => void addAlias(event)}><div><label htmlFor="point-alias">Yeni alias</label><p id="point-alias-help">Arama için alternatif ad ekleyin. Mevcut aliaslar bu ekranda silinemez veya değiştirilemez.</p></div><input id="point-alias" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} minLength={2} maxLength={160} required aria-describedby="point-alias-help" /><button type="submit" disabled={aliasBusy}>{aliasBusy ? 'EKLENİYOR...' : 'Alias ekle'}</button></form> : null}</section>;
}
