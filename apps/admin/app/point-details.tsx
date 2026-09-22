'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';

type Alias = { id: string; alias: string; createdAt: string; createdBy?: { id: string; name: string } | null };
type EquipmentSnapshot = { coolerCount?: number | null; towerCount?: number | null; tapCount?: number | null; smarttapCount?: number | null };
type EquipmentAudit = {
  id: string; action: string; createdAt: string; note?: string | null; oldValue?: EquipmentSnapshot | null; newValue?: EquipmentSnapshot | null;
  actor: { id: string; name: string; username: string; role: string };
};
type AuditResponse = { count: number; items: EquipmentAudit[] };

function maintenanceTypeLabel(value: string) { return value === 'SMARTCLEAN' ? 'Smart Clean' : value === 'STANDARD' ? 'Standart Bakım' : 'Bakım tipi bilinmiyor'; }
function statusLabel(value: string) { return value === 'ACTIVE' ? 'Aktif' : value === 'PASSIVE' ? 'Pasif' : value === 'CANCELLED' ? 'İptal' : 'Durum bilinmiyor'; }
function locationSummary(source?: string | null, confidence?: number | null) {
  const score = confidence === null || confidence === undefined ? '—' : `%${confidence}`;
  return source === 'GOOGLE' ? `Google doğrulandı · ${score}` : `Konum kaydı · ${score}`;
}

type Point = {
  id: string; code: string; name: string; sapName?: string | null; address?: string | null;
  status: string; maintenanceType: string; maintenanceWeek?: number | null; smartcleanReferenceAt?: string | null;
  canonicalLatitude?: string | number | null; canonicalLongitude?: string | number | null;
  locationSource?: string | null; locationConfidence?: number | null; googlePlaceId?: string | null; googleBusinessName?: string | null;
  coolerCount?: number | null; towerCount?: number | null; tapCount?: number | null; smarttapCount?: number | null;
  equipmentVerifiedAt?: string | null; equipmentVerifiedById?: string | null;
  region?: { id: string; name: string } | null; aliases?: Alias[];
};

export default function PointDetails() {
  const [points, setPoints] = useState<Point[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [point, setPoint] = useState<Point | null>(null);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [equipmentHistory, setEquipmentHistory] = useState<EquipmentAudit[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingPoints, setLoadingPoints] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function loadPoints() {
    setLoadingPoints(true);
    try {
      const list = await api<Point[]>('/api/backend/points');
      setPoints(list);
      setSelectedId((current) => current || list[0]?.id || '');
    } finally { setLoadingPoints(false); }
  }

  async function loadPoint(id: string) {
    if (!id) { setPoint(null); setAliases([]); setEquipmentHistory([]); return; }
    setBusy(true); setError('');
    try {
      const [detail, aliasList, equipmentAudit] = await Promise.all([
        api<Point>(`/api/backend/points/${id}`),
        api<Alias[]>(`/api/backend/points/${id}/aliases`),
        api<AuditResponse>(`/api/backend/audit?entityType=POINT_EQUIPMENT&entityId=${encodeURIComponent(id)}&limit=100`),
      ]);
      setPoint(detail); setAliases(aliasList); setEquipmentHistory(equipmentAudit.items ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void loadPoints().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { void loadPoint(selectedId); }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return points;
    return points.filter((p) => `${p.code} ${p.name} ${p.sapName ?? ''} ${p.googleBusinessName ?? ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [points, search]);

  async function addAlias() {
    if (!point) return;
    const alias = window.prompt('Yeni alias / alternatif nokta adı:')?.trim();
    if (!alias) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/backend/points/${point.id}/aliases`, { method: 'POST', body: JSON.stringify({ alias }) });
      await loadPoint(point.id); await loadPoints();
      setNotice('Alias eklendi.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function runAction(path: string, label: string) {
    if (!point) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(path, { method: 'POST' });
      await loadPoint(point.id); await loadPoints();
      setNotice(label);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const equipmentFields = point ? [
    ['Soğutucu', point.coolerCount], ['Kule', point.towerCount], ['Musluk', point.tapCount], ['SmartTap', point.smarttapCount],
  ] as const : [];
  const missingEquipment = equipmentFields.filter(([, value]) => value == null).map(([label]) => label);
  const equipmentComplete = point ? missingEquipment.length === 0 : false;
  const latestEquipmentAudit = equipmentHistory[0] ?? null;
  const currentEquipment = point ? { coolerCount: point.coolerCount, towerCount: point.towerCount, tapCount: point.tapCount, smarttapCount: point.smarttapCount } : null;
  const latestAuditMatches = !point || !latestEquipmentAudit?.newValue ? null : ['coolerCount', 'towerCount', 'tapCount', 'smarttapCount'].every((key) => {
    const k = key as keyof EquipmentSnapshot;
    return (latestEquipmentAudit.newValue?.[k] ?? null) === (currentEquipment?.[k] ?? null);
  });
  const verificationAgeDays = point?.equipmentVerifiedAt ? Math.floor((Date.now() - new Date(point.equipmentVerifiedAt).getTime()) / 86400000) : null;

  return <>
    <section className="panel">
      <div className="panelHeader"><div><h2>Nokta Detayı</h2><p>Saha, SAP, Google, alias, ekipman ve konum verilerini tek yerde incele.</p></div><button className="ghost iconAction" disabled={busy} onClick={() => void loadPoints()}><AdminIcon name="refresh" size={17} /><span>YENİLE</span></button></div>
      {error ? <div className="error banner">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="filterBar pointDetailFilters">
        <label className="searchField"><AdminIcon name="search" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Müşteri no / saha adı / SAP adı / Google adı ara" /></label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {filtered.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select><span className="filterCount">{filtered.length} / {points.length}</span>
      </div>
    </section>

    {loadingPoints ? <section className="panel"><div className="emptyState"><AdminIcon name="clock" /><strong>Noktalar yükleniyor</strong><span>Nokta detayları hazırlanıyor.</span></div></section> : point ? <>
      <section className="dashboardGrid">
        <div className="dashboardCard"><span>Konum doğrulaması</span><strong>{locationSummary(point.locationSource, point.locationConfidence)}</strong><small title={`Kaynak: ${point.locationSource ?? 'bilinmiyor'}`}>Konum özeti</small></div>
        <div className="dashboardCard"><span>Alias</span><strong>{aliases.length}</strong><small>Alternatif isim</small></div>
        <div className="dashboardCard"><span>Ekipman</span><strong>{equipmentComplete ? 'Tam' : 'Eksik'}</strong><small>Profil durumu</small></div>
        <div className="dashboardCard"><span>Bakım</span><strong>{maintenanceTypeLabel(point.maintenanceType)}</strong><small>Hafta {point.maintenanceWeek ?? '—'}</small></div>
      </section>

      <section className="panel">
        <div className="panelHeader"><div><h2>{point.name}</h2><p>{point.code} · {point.region?.name || 'Bölge yok'} · {statusLabel(point.status)}</p></div><div className="actions"><button className="small" disabled={busy} onClick={() => void addAlias()}>ALIAS EKLE</button><button className="small" disabled={busy} onClick={() => void runAction(`/api/backend/points/${point.id}/address-discovery`, 'Adres keşfi tamamlandı.')}>ADRES KEŞFİ</button><button className="small" disabled={busy} onClick={() => void runAction(`/api/backend/maintenance/google-place-match?pointId=${encodeURIComponent(point.id)}`, 'Google eşleştirme tamamlandı.')}>GOOGLE EŞLEŞTİR</button><button className="small" disabled={busy} onClick={() => void runAction(`/api/backend/maintenance/location-refresh?pointId=${encodeURIComponent(point.id)}`, 'Konum öğrenimi yenilendi.')}>KONUMU YENİLE</button></div></div>
        <div className="tableWrap"><table><tbody>
          <tr><th>Saha adı</th><td>{point.name}</td><th>SAP resmi adı</th><td>{point.sapName || '—'}</td></tr>
          <tr><th>Google işletme adı</th><td>{point.googleBusinessName || '—'}</td><th>Google Place ID</th><td>{point.googlePlaceId || '—'}</td></tr>
          <tr><th>Adres</th><td colSpan={3}>{point.address || '—'}</td></tr>
          <tr><th>Canonical konum</th><td>{point.canonicalLatitude ?? '—'}, {point.canonicalLongitude ?? '—'}</td><th>Konum doğrulaması</th><td title={`Kaynak: ${point.locationSource ?? 'bilinmiyor'}`}>{locationSummary(point.locationSource, point.locationConfidence)}</td></tr>
          <tr><th>Soğutucu</th><td>{point.coolerCount ?? '—'}</td><th>Kule</th><td>{point.towerCount ?? '—'}</td></tr>
          <tr><th>Musluk</th><td>{point.tapCount ?? '—'}</td><th>SmartTap</th><td>{point.smarttapCount ?? '—'}</td></tr>
          <tr><th>Ekipman doğrulama</th><td colSpan={3}>{point.equipmentVerifiedAt ? new Date(point.equipmentVerifiedAt).toLocaleString('tr-TR') : 'Henüz doğrulanmadı'}</td></tr>
        </tbody></table></div>
      </section>

      <section className="panel">
        <div className="panelHeader"><div><h2>Ekipman Yönetimi</h2><p>Teknisyen doğrulamalarını, profil eksiklerini ve ekipman değişiklik geçmişini incele.</p></div><span className={equipmentComplete && latestAuditMatches !== false ? 'pill active' : 'pill'}>{equipmentComplete ? 'PROFİL TAM' : 'PROFİL EKSİK'}</span></div>
        <div className="dashboardGrid">
          <div className="dashboardCard"><span>Eksik alan</span><strong>{missingEquipment.length}</strong><small>{missingEquipment.length ? missingEquipment.join(', ') : 'Tüm ekipman sayıları mevcut'}</small></div>
          <div className="dashboardCard"><span>Son doğrulama</span><strong>{point.equipmentVerifiedAt ? (verificationAgeDays === 0 ? 'Bugün' : `${verificationAgeDays} gün`) : 'Yok'}</strong><small>{point.equipmentVerifiedAt ? new Date(point.equipmentVerifiedAt).toLocaleString('tr-TR') : 'Teknisyen doğrulaması bekleniyor'}</small></div>
          <div className="dashboardCard"><span>Değişiklik kaydı</span><strong>{equipmentHistory.length}</strong><small>POINT_EQUIPMENT audit</small></div>
          <div className="dashboardCard"><span>Audit uyumu</span><strong>{latestAuditMatches == null ? 'Bilinmiyor' : latestAuditMatches ? 'Uyumlu' : 'Farklı'}</strong><small>{latestAuditMatches === false ? 'Mevcut profil son audit ile eşleşmiyor' : 'Son kayıt kontrolü'}</small></div>
        </div>
        {latestAuditMatches === false ? <div className="error banner">Mevcut ekipman profili, son ekipman audit kaydının yeni değeriyle eşleşmiyor. İnceleme önerilir.</div> : null}
        {!equipmentComplete ? <div className="banner">Eksik ekipman alanları: {missingEquipment.join(', ')}. Bu profil bir sonraki teknisyen doğrulamasında tamamlanmalı.</div> : null}
        <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Doğrulayan</th><th>Önce</th><th>Sonra</th><th>Not</th></tr></thead><tbody>
          {equipmentHistory.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="history" /><strong>Ekipman değişikliği yok</strong><span>Bu nokta için kayıtlı ekipman audit olayı bulunmuyor.</span></div></td></tr> : equipmentHistory.map((item) => <tr key={item.id}>
            <td>{new Date(item.createdAt).toLocaleString('tr-TR')}</td><td><strong>{item.action}</strong></td><td>{item.actor.name}<div className="muted">@{item.actor.username}</div></td>
            <td><span className="muted">S {item.oldValue?.coolerCount ?? '—'} · K {item.oldValue?.towerCount ?? '—'} · M {item.oldValue?.tapCount ?? '—'} · ST {item.oldValue?.smarttapCount ?? '—'}</span></td>
            <td><span className="muted">S {item.newValue?.coolerCount ?? '—'} · K {item.newValue?.towerCount ?? '—'} · M {item.newValue?.tapCount ?? '—'} · ST {item.newValue?.smarttapCount ?? '—'}</span></td><td>{item.note || '—'}</td>
          </tr>)}
        </tbody></table></div>
        <p className="muted">S: Soğutucu · K: Kule · M: Musluk · ST: SmartTap. Admin ekranı ekipman sayısını değiştirmez; saha doğrulaması teknisyen akışında kalır.</p>
      </section>

      <section className="panel"><div className="panelHeader"><div><h2>Alias / Alternatif İsimler</h2><p>Google ve saha eşleştirmelerinde kullanılan ek isimler.</p></div></div>
        <div className="tableWrap"><table><thead><tr><th>Alias</th><th>Ekleyen</th><th>Tarih</th></tr></thead><tbody>
          {aliases.length === 0 ? <tr><td colSpan={3}><div className="emptyState compact"><AdminIcon name="detail" /><strong>Alias yok</strong><span>Henüz alternatif nokta adı eklenmemiş.</span><button className="small" disabled={busy} onClick={() => void addAlias()}>Alias ekle</button></div></td></tr> : aliases.map((a) => <tr key={a.id}><td><strong>{a.alias}</strong></td><td>{a.createdBy?.name || '—'}</td><td>{new Date(a.createdAt).toLocaleString('tr-TR')}</td></tr>)}
        </tbody></table></div>
      </section>
    </> : <section className="panel"><div className="emptyState"><AdminIcon name="search" /><strong>Nokta seçilmedi</strong><span>Arama sonucundan bir nokta seç.</span></div></section>}
  </>;
}
