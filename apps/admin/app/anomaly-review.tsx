'use client';

import { useEffect, useState } from 'react';

type Technician = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type ReviewItem = {
  id: string;
  performedAt: string;
  recordedAtServer: string;
  enteredLate: boolean;
  suspiciousBatch: boolean;
  reviewReason?: string | null;
  locationLearningEligible: boolean;
  sitePresenceConfirmed?: boolean | null;
  sitePresenceDistanceM?: number | null;
  latitude: string | number;
  longitude: string | number;
  accuracyMeters?: string | number | null;
  technician: { id: string; name: string };
  point: { id: string; code: string; name: string; regionId?: string | null; locationSource: string; locationConfidence: number; address?: string | null };
};
type ReviewDecision = 'NO_ISSUE' | 'KEEP_LOCATION_EXCLUDED' | 'NEEDS_FOLLOWUP';

export default function AnomalyReview() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
    return body as T;
  }

  async function load() {
    const [queue, users] = await Promise.all([
      api<ReviewItem[]>('/api/backend/maintenance/review-queue?limit=200'),
      api<Technician[]>('/api/backend/users'),
    ]);
    setItems(queue);
    setTechnicians(users.filter((user) => user.role === 'TECHNICIAN' && user.active));
  }

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

  return <>
    <section className="panel priorityPanel">
      <div className="panelHeader"><div><h2>Bakım Anomalileri</h2><p>Şüpheli ardışık girişleri, uyumsuz seyahat sürelerini ve inceleme önerilen kayıtları yönet.</p></div><div className="actions"><span className="pill">{items.length} bekliyor</span><button className="ghost" onClick={() => void scanAll()} disabled={busy || technicians.length === 0}>TÜMÜNÜ TARA</button></div></div>
      {error ? <div className="error banner">{error}</div> : null}
      <div className="tableWrap"><table><thead><tr><th>Nokta</th><th>Teknisyen</th><th>Neden</th><th>Saha kanıtı</th><th>Zaman</th><th>Karar</th></tr></thead><tbody>
        {items.length === 0 ? <tr><td colSpan={6}>İnceleme bekleyen anomali yok.</td></tr> : items.map((item) => <tr key={item.id}>
          <td><strong>{item.point.name}</strong><div className="muted">{item.point.code} · {item.point.address || 'Adres yok'}</div></td>
          <td>{item.technician.name}</td>
          <td><span className="pill">{item.suspiciousBatch ? 'Şüpheli seri giriş' : 'İnceleme'}</span><div className="muted">{item.reviewReason || 'Neden belirtilmedi'}</div>{item.enteredLate ? <div className="muted">Geç giriş</div> : null}</td>
          <td>{item.sitePresenceConfirmed ? 'Sahada doğrulandı' : 'Doğrulanmadı'}{item.sitePresenceDistanceM != null ? <div className="muted">{Math.round(item.sitePresenceDistanceM)} m</div> : null}</td>
          <td>{new Date(item.recordedAtServer).toLocaleString('tr-TR')}</td>
          <td className="actions"><button className="small" disabled={busy} onClick={() => void resolve(item, 'NO_ISSUE')}>SORUN YOK</button><button className="small" disabled={busy} onClick={() => void resolve(item, 'KEEP_LOCATION_EXCLUDED')}>KONUMU DIŞLA</button><button className="small" disabled={busy} onClick={() => void resolve(item, 'NEEDS_FOLLOWUP')}>TAKİP</button></td>
        </tr>)}
      </tbody></table></div>
    </section>

    <section className="panel"><div className="panelHeader"><div><h2>24 Saatlik Tarama</h2><p>Teknisyen bazında anomaly scan çalıştır.</p></div></div><div className="helpGrid">
      {technicians.map((technician) => <button className="helpOption" key={technician.id} onClick={() => void scan(technician.id)} disabled={busy}><span><strong>{technician.name}</strong><small>@{technician.username} · son 24 saat</small></span></button>)}
    </div></section>
  </>;
}
