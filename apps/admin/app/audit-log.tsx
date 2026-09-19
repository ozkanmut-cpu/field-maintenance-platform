'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';

type AuditItem = {
  id: string; entityType: string; entityId: string; action: string; note?: string | null; createdAt: string;
  oldValue?: unknown; newValue?: unknown;
  actor: { id: string; name: string; username: string; role: string };
};

export default function AuditLog() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AuditItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (entityType) params.set('entityType', entityType);
      if (action) params.set('action', action);
      if (actorId) params.set('actorId', actorId);
      const response = await fetch(`/api/backend/audit?${params}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || `HTTP ${response.status}`);
      setItems(body.items ?? []); setTotal(body.count ?? 0);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);
  const entityTypes = useMemo(() => [...new Set(items.map((x) => x.entityType))].sort(), [items]);
  const actions = useMemo(() => [...new Set(items.map((x) => x.action))].sort(), [items]);
  const actors = useMemo(() => [...new Map(items.map((x) => [x.actor.id, x.actor])).values()].sort((a,b) => a.name.localeCompare(b.name, 'tr')), [items]);
  const visible = items.filter((item) => !search || `${item.entityType} ${item.entityId} ${item.action} ${item.actor.name} ${item.note ?? ''}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')));

  return <>
    <section className="dashboardGrid">
      <div className="dashboardCard"><span>Toplam kayıt</span><strong>{total}</strong><small>Filtreye uyan audit olayı</small></div>
      <div className="dashboardCard"><span>Gösterilen</span><strong>{visible.length}</strong><small>Son 300 kayıt içinde</small></div>
      <div className="dashboardCard"><span>Entity tipi</span><strong>{new Set(items.map((x) => x.entityType)).size}</strong><small>Farklı kayıt türü</small></div>
      <div className="dashboardCard"><span>Aktör</span><strong>{new Set(items.map((x) => x.actor.id)).size}</strong><small>İşlem yapan kullanıcı</small></div>
    </section>
    <section className="panel">
      <div className="panelHeader"><div><h2>İşlem Geçmişi</h2><p>Admin ve saha kaynaklı kritik değişikliklerin kim, ne zaman, neyi değiştirdiğini incele.</p></div><button className="ghost iconAction" onClick={() => void load()} disabled={busy}><AdminIcon name="refresh" size={17} /><span>YENİLE</span></button></div>
      {error ? <div className="error banner">{error}</div> : null}
      <form className="filterBar auditFilters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label className="searchField"><AdminIcon name="search" size={18} /><input aria-label="Audit kaydı ara" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara: işlem, kullanıcı, entity, not..." /></label>
        <select aria-label="Entity tipi filtresi" value={entityType} onChange={(e) => setEntityType(e.target.value)}><option value="">Tüm entity tipleri</option>{entityTypes.map((v) => <option key={v}>{v}</option>)}</select>
        <select aria-label="İşlem filtresi" value={action} onChange={(e) => setAction(e.target.value)}><option value="">Tüm işlemler</option>{actions.map((v) => <option key={v}>{v}</option>)}</select>
        <select aria-label="Kullanıcı filtresi" value={actorId} onChange={(e) => setActorId(e.target.value)}><option value="">Tüm kullanıcılar</option>{actors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
        <button type="submit" disabled={busy}>FİLTRELE</button>
      </form>
      <div className="tableWrap"><table><thead><tr><th>Tarih</th><th>İşlem</th><th>Entity</th><th>Kullanıcı</th><th>Not</th><th></th></tr></thead><tbody>
        {busy && items.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="clock" /><strong>İşlem geçmişi yükleniyor</strong><span>Audit kayıtları hazırlanıyor.</span></div></td></tr> : visible.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="search" /><strong>Audit kaydı bulunamadı</strong><span>Arama veya filtreleri değiştir.</span></div></td></tr> : visible.map((item) => <tr key={item.id}>
          <td>{new Date(item.createdAt).toLocaleString('tr-TR')}</td><td><strong>{item.action}</strong></td><td>{item.entityType}<div className="muted">{item.entityId}</div></td><td>{item.actor.name}<div className="muted">@{item.actor.username}</div></td><td>{item.note || '—'}</td><td><button className="small iconAction" onClick={() => setSelected(item)}><AdminIcon name="detail" size={15} /><span>DETAY</span></button></td>
        </tr>)}
      </tbody></table></div>
    </section>
    {selected ? <section className="panel"><div className="panelHeader"><div><h2>{selected.action}</h2><p>{selected.entityType} · {selected.entityId}</p></div><button className="ghost" onClick={() => setSelected(null)}><AdminIcon name="error" size={16} /><span>KAPAT</span></button></div>
      <div className="auditJson"><details open><summary>Önceki değer</summary><pre>{JSON.stringify(selected.oldValue ?? null, null, 2)}</pre></details><details open><summary>Yeni değer</summary><pre>{JSON.stringify(selected.newValue ?? null, null, 2)}</pre></details></div>
    </section> : null}
  </>;
}
