'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminIcon } from './admin-icons';

type AuditItem = {
  id: string; entityType: string; entityId: string; action: string; note?: string | null; createdAt: string;
  oldValue?: unknown; newValue?: unknown;
  actor: { id: string; name: string; username: string; role: string };
};

export function reconcileAuditSelection<T extends { id: string }>(selected: T | null, nextItems: T[]) {
  return selected && !nextItems.some((item) => item.id === selected.id) ? null : selected;
}

export function auditShownCountLabel(search: string, loadedCount: number) {
  return search.trim()
    ? 'Yüklenen en fazla 300 kayıt içinde metin aramasına uyan kayıt'
    : `Yüklenen ${loadedCount} kaydın tamamı (en fazla 300)`;
}

export function auditDetailFocusTarget(trigger: HTMLElement | null, fallback: HTMLElement | null) {
  return trigger?.isConnected ? trigger : fallback;
}

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
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const selectedRef = useRef<AuditItem | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement | null>(null);
  const auditHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusAfterCloseRef = useRef<'trigger' | 'fallback' | null>(null);

  async function load() {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setBusy(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (entityType) params.set('entityType', entityType);
      if (action) params.set('action', action);
      if (actorId) params.set('actorId', actorId);
      const response = await fetch(`/api/backend/audit?${params}`, { signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || `HTTP ${response.status}`);
      if (requestId !== requestIdRef.current) return;
      const nextItems = (body.items ?? []) as AuditItem[];
      setItems(nextItems); setTotal(body.count ?? 0);
      if (selectedRef.current && !reconcileAuditSelection(selectedRef.current, nextItems)) {
        selectedRef.current = null;
        focusAfterCloseRef.current = 'fallback';
        setSelected(null);
      }
    } catch (e) {
      if (requestId !== requestIdRef.current || (e instanceof DOMException && e.name === 'AbortError')) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (requestId === requestIdRef.current) setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
      requestControllerRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    detailCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selected]);
  useEffect(() => {
    const requestedFocus = focusAfterCloseRef.current;
    if (selected || !requestedFocus) return;
    const trigger = requestedFocus === 'trigger' ? detailTriggerRef.current : null;
    const target = auditDetailFocusTarget(trigger, auditHeadingRef.current);
    target?.focus();
    focusAfterCloseRef.current = null;
  }, [selected]);
  const entityTypes = useMemo(() => [...new Set(items.map((x) => x.entityType))].sort(), [items]);
  const actions = useMemo(() => [...new Set(items.map((x) => x.action))].sort(), [items]);
  const actors = useMemo(() => [...new Map(items.map((x) => [x.actor.id, x.actor])).values()].sort((a,b) => a.name.localeCompare(b.name, 'tr')), [items]);
  const visible = items.filter((item) => !search || `${item.entityType} ${item.entityId} ${item.action} ${item.actor.name} ${item.note ?? ''}`.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')));
  const shownCountLabel = auditShownCountLabel(search, items.length);
  const closeDetail = () => {
    selectedRef.current = null;
    focusAfterCloseRef.current = 'trigger';
    setSelected(null);
  };
  const openDetail = (item: AuditItem, trigger: HTMLButtonElement) => {
    detailTriggerRef.current = trigger;
    selectedRef.current = item;
    setSelected(item);
  };

  return <>
    <section className="dashboardGrid">
      <div className="dashboardCard"><span>Toplam kayıt</span><strong>{total}</strong><small>Sunucu filtresine uyan toplam kayıt</small></div>
      <div className="dashboardCard"><span>Gösterilen</span><strong>{visible.length}</strong><small>{shownCountLabel}</small></div>
      <div className="dashboardCard"><span>Entity tipi</span><strong>{new Set(items.map((x) => x.entityType)).size}</strong><small>Farklı kayıt türü</small></div>
      <div className="dashboardCard"><span>Aktör</span><strong>{new Set(items.map((x) => x.actor.id)).size}</strong><small>İşlem yapan kullanıcı</small></div>
    </section>
    <section className="panel">
      <div className="panelHeader"><div><h2 ref={auditHeadingRef} tabIndex={-1}>İşlem Geçmişi</h2><p>Admin ve saha kaynaklı kritik değişikliklerin kim, ne zaman, neyi değiştirdiğini incele.</p></div><button className="ghost iconAction" onClick={() => void load()} disabled={busy}><AdminIcon name="refresh" size={17} /><span>YENİLE</span></button></div>
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
          <td>{new Date(item.createdAt).toLocaleString('tr-TR')}</td><td><strong>{item.action}</strong></td><td>{item.entityType}<div className="muted">{item.entityId}</div></td><td>{item.actor.name}<div className="muted">@{item.actor.username}</div></td><td>{item.note || '—'}</td><td><button className="small iconAction" onClick={(event) => openDetail(item, event.currentTarget)}><AdminIcon name="detail" size={15} /><span>DETAY</span></button></td>
        </tr>)}
      </tbody></table></div>
    </section>
    {selected ? <section className="panel" role="region" aria-label="Audit kayıt detayı"><div className="panelHeader"><div><h2>{selected.action}</h2><p>{selected.entityType} · {selected.entityId}</p></div><button ref={detailCloseRef} className="ghost" onClick={closeDetail}><AdminIcon name="error" size={16} /><span>KAPAT</span></button></div>
      <div className="auditJson"><details open><summary>Önceki değer</summary><pre>{JSON.stringify(selected.oldValue ?? null, null, 2)}</pre></details><details open><summary>Yeni değer</summary><pre>{JSON.stringify(selected.newValue ?? null, null, 2)}</pre></details></div>
    </section> : null}
  </>;
}
