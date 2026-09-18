'use client';

import { useEffect, useState } from 'react';
import type { AdminLocation } from './admin-navigation';

type Point = { id: string; code: string; name: string; status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED'; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; maintenanceWeek?: number | null; smartcleanReferenceAt?: string | null; address?: string | null; region?: { name: string } | null; locationSource?: string | null; locationConfidence?: number | null };
type Props = { location: AdminLocation };

export default function PointDetailPage({ location }: Props) {
  const [point, setPoint] = useState<Point | null>(null);
  const [draft, setDraft] = useState<Point | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pointId = location.pointId;
  const activeTab = location.detailTab ?? 'general';
  async function load() { if (!pointId) return; setBusy(true); try { const response = await fetch(`/api/backend/points/${pointId}`); if (!response.ok) throw new Error(`HTTP ${response.status}`); const value = await response.json() as Point; setPoint(value); setDraft(value); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, [pointId]);
  async function save() { if (!point || !draft) return; setBusy(true); try { const payload = Object.fromEntries(Object.entries({ name: draft.name, status: draft.status, maintenanceType: draft.maintenanceType, maintenanceWeek: draft.maintenanceWeek, smartcleanReferenceAt: draft.smartcleanReferenceAt }).filter(([key, value]) => point[key as keyof Point] !== value)); const response = await fetch(`/api/backend/points/${point.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); setEditing(false); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } }
  if (!pointId) return <section className="panel"><div className="emptyState"><strong>Nokta seçilmedi</strong><span>Liste ekranından bir Detay bağlantısı açın.</span></div></section>;
  if (!point) return <section className="panel"><div className="emptyState"><strong>{busy ? 'Nokta yükleniyor' : 'Nokta bulunamadı'}</strong>{error ? <span>{error}</span> : null}</div></section>;
  const value = draft ?? point;
  return <section className="panel"><div className="panelHeader"><div><h2>{point.name}</h2><p>{point.code} · {point.region?.name ?? 'Bölge yok'} · {point.locationSource ?? 'UNKNOWN'} / {point.locationConfidence ?? 0}%</p></div><div className="rowActions">{editing ? <><button className="ghost" onClick={() => { setDraft(point); setEditing(false); }}>İptal</button><button disabled={busy} onClick={() => void save()}>Kaydet</button></> : <button onClick={() => setEditing(true)}>Düzenle</button>}</div></div>{error ? <div className="error banner">{error}</div> : null}<div className="detailTabs" role="tablist">{[['general', 'Genel Bilgiler'], ['location', 'Konum'], ['maintenance', 'Bakım'], ['assignments', 'Görevlendirme'], ['equipment', 'Ekipman'], ['paperwork', 'Evrak'], ['timeline', 'Timeline'], ['audit', 'Audit / Geçmiş']].map(([id, label]) => <button key={id} role="tab" aria-selected={activeTab === id}>{label}</button>)}</div>{activeTab === 'maintenance' ? <div className="banner">Bakım türü: {point.maintenanceType} · Rut haftası: {point.maintenanceWeek ?? '—'} · SmartClean referansı: {point.smartcleanReferenceAt ?? '—'}</div> : activeTab === 'assignments' ? <div className="banner">Bölge varsayılan teknisyeni ve nokta bazlı görevlendirme geçmişi bu sekmede görüntülenir.</div> : <div className="tableWrap"><table><tbody><tr><th>Kod</th><td>{point.code}</td><th>Durum</th><td>{editing ? <select value={value.status} onChange={(event) => setDraft({ ...value, status: event.target.value as Point['status'] })}><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select> : point.status}</td></tr><tr><th>Nokta adı</th><td>{editing ? <input value={value.name} onChange={(event) => setDraft({ ...value, name: event.target.value })} /> : point.name}</td><th>Bakım tipi</th><td>{point.maintenanceType}</td></tr><tr><th>Adres</th><td colSpan={3}>{point.address ?? '—'}</td></tr></tbody></table></div>}</section>;
}
