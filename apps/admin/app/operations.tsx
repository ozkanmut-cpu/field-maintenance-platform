'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Technician = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN'; active: boolean };
type Region = {
  id: string;
  name: string;
  technicianId?: string | null;
  technician?: { id: string; name: string; username?: string; active: boolean } | null;
  _count?: { points: number };
};
type Point = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED';
  maintenanceType: 'STANDARD' | 'SMARTCLEAN';
  maintenanceWeek?: number | null;
  smartcleanReferenceAt?: string | null;
  region: Region;
};

type AttemptReviewItem = {
  id: string; reason: 'BUSINESS_CLOSED' | 'AUTHORIZED_PERSON_UNAVAILABLE' | 'ACCESS_FAILED' | 'OTHER';
  note?: string | null; attemptedAt: string;
  point: { id: string; code: string; name: string; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; region: { name: string } };
  technician: { id: string; name: string; username: string };
  assistedForTechnician?: { id: string; name: string; username: string } | null;
};
type AttemptHistoryItem = AttemptReviewItem & {
  reviewStatus: 'APPROVED' | 'REJECTED'; reviewedAt?: string | null; reviewNote?: string | null;
  closedDueDate?: string | null; reviewedBy?: { id: string; name: string; username: string } | null;
};
type Props = { users: Technician[] };

export default function Operations({ users }: Props) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [attemptQueue, setAttemptQueue] = useState<AttemptReviewItem[]>([]);
  const [attemptHistory, setAttemptHistory] = useState<AttemptHistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [regionName, setRegionName] = useState('');
  const [regionTechnicianId, setRegionTechnicianId] = useState('');
  const [pointForm, setPointForm] = useState({
    code: '', name: '', regionId: '', status: 'ACTIVE',
    maintenanceType: 'STANDARD', maintenanceWeek: '1', smartcleanReferenceAt: '',
  });
  const technicians = useMemo(
    () => users.filter((user) => user.role === 'TECHNICIAN' && user.active),
    [users],
  );

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body?.message;
      throw new Error(Array.isArray(message) ? message.join(', ') : message || `HTTP ${response.status}`);
    }
    return body as T;
  }

  async function load() {
    const [regionList, pointList, attemptReview, reviewHistory] = await Promise.all([
      api<Region[]>('/api/backend/regions'),
      api<Point[]>('/api/backend/points'),
      api<{ count: number; items: AttemptReviewItem[] }>('/api/backend/maintenance/attempt-review-queue'),
      api<{ count: number; items: AttemptHistoryItem[] }>('/api/backend/maintenance/attempt-review-history?limit=20'),
    ]);
    setRegions(regionList);
    setPoints(pointList);
    setAttemptQueue(attemptReview.items);
    setAttemptHistory(reviewHistory.items);
    setPointForm((current) => ({ ...current, regionId: current.regionId || regionList[0]?.id || '' }));
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function createRegion(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/backend/regions', {
        method: 'POST',
        body: JSON.stringify({ name: regionName, technicianId: regionTechnicianId || undefined }),
      });
      setRegionName(''); setRegionTechnicianId('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function changeRegionTechnician(region: Region, technicianId: string) {
    if (!technicianId || technicianId === region.technicianId) return;
    setBusy(true); setError('');
    try {
      await api(`/api/backend/regions/${region.id}/technician`, {
        method: 'PATCH', body: JSON.stringify({ technicianId }),
      });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function createPoint(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const payload: Record<string, unknown> = {
        code: pointForm.code, name: pointForm.name,
        regionId: pointForm.regionId, status: pointForm.status,
        maintenanceType: pointForm.maintenanceType,
      };
      if (pointForm.maintenanceType === 'STANDARD') payload.maintenanceWeek = Number(pointForm.maintenanceWeek);
      else payload.smartcleanReferenceAt = pointForm.smartcleanReferenceAt;
      await api('/api/backend/points', { method: 'POST', body: JSON.stringify(payload) });
      setPointForm((current) => ({ ...current, code: '', name: '', smartcleanReferenceAt: '' }));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function reviewAttempt(item: AttemptReviewItem, decision: 'APPROVED' | 'REJECTED') {
    const confirmed = window.confirm(decision === 'APPROVED'
      ? 'Bu yapılamadı kaydı onaylanacak ve ilgili görev kapatılacak. Devam edilsin mi?'
      : 'Bu kayıt reddedilecek ve görev açık kalacak. Devam edilsin mi?');
    if (!confirmed) return;
    const note = window.prompt('Yönetici notu (opsiyonel):') ?? undefined;
    setBusy(true); setError('');
    try {
      await api('/api/backend/maintenance/attempt-review', {
        method: 'POST', body: JSON.stringify({ attemptId: item.id, decision, note }),
      });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function changePointStatus(point: Point, status: Point['status']) {
    if (status === point.status) return;
    setBusy(true); setError('');
    try {
      await api(`/api/backend/points/${point.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      {error ? <div className="error banner">{error}</div> : null}
      <section className="panel">
        <div className="panelHeader">
          <div><h2>Bölgeler</h2><p>Bölge sorumlularını ve nokta dağılımını yönet.</p></div>
          <button className="ghost" onClick={() => void load()} disabled={busy}>Yenile</button>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Bölge</th><th>Nokta</th><th>Teknisyen</th></tr></thead>
            <tbody>
              {regions.map((region) => (
                <tr key={region.id}>
                  <td><strong>{region.name}</strong></td>
                  <td>{region._count?.points ?? 0}</td>
                  <td>
                    <select value={region.technicianId ?? ''} onChange={(e) => void changeRegionTechnician(region, e.target.value)} disabled={busy}>
                      <option value="">Teknisyen seçilmedi</option>
                      {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="compactForm" onSubmit={createRegion}>
          <input value={regionName} onChange={(e) => setRegionName(e.target.value)} placeholder="Yeni bölge adı" minLength={2} required />
          <select value={regionTechnicianId} onChange={(e) => setRegionTechnicianId(e.target.value)}>
            <option value="">Teknisyen sonra seçilsin</option>
            {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
          </select>
          <button disabled={busy} type="submit">BÖLGE EKLE</button>
        </form>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div><h2>Yapılamadı Onayları</h2><p>Teknisyenin kapatamadığı bakım görevlerini incele. Onaylanan görev kapanır; reddedilen görev açık kalır.</p></div>
          <span className="pill">{attemptQueue.length} bekliyor</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Nokta</th><th>Teknisyen</th><th>Neden</th><th>Tarih</th><th></th></tr></thead>
            <tbody>
              {attemptQueue.length === 0 ? <tr><td colSpan={5}>Bekleyen yapılamadı kaydı yok.</td></tr> : attemptQueue.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.point.name}</strong><div className="muted">{item.point.code} · {item.point.region.name}</div></td>
                  <td>{item.technician.name}{item.assistedForTechnician ? <div className="muted">{item.assistedForTechnician.name} için yardım</div> : null}</td>
                  <td>{item.reason === 'BUSINESS_CLOSED' ? 'İşletme kapalı' : item.reason === 'AUTHORIZED_PERSON_UNAVAILABLE' ? 'Yetkili kişi yok' : item.reason === 'ACCESS_FAILED' ? 'Erişim sağlanamadı' : 'Diğer'}{item.note ? <div className="muted">{item.note}</div> : null}</td>
                  <td>{new Date(item.attemptedAt).toLocaleString('tr-TR')}</td>
                  <td className="actions"><button className="small" disabled={busy} onClick={() => void reviewAttempt(item, 'REJECTED')}>Reddet</button><button disabled={busy} onClick={() => void reviewAttempt(item, 'APPROVED')}>ONAYLA / KAPAT</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader"><div><h2>Son Yapılamadı Kararları</h2><p>Son 20 yönetici kararını ve görevin kapanıp kapanmadığını gör.</p></div></div>
        <div className="tableWrap"><table>
          <thead><tr><th>Nokta</th><th>Karar</th><th>Teknisyen</th><th>Yönetici</th><th>Tarih</th></tr></thead>
          <tbody>{attemptHistory.length === 0 ? <tr><td colSpan={5}>Henüz karar geçmişi yok.</td></tr> : attemptHistory.map((item) => (
            <tr key={item.id}>
              <td><strong>{item.point.name}</strong><div className="muted">{item.point.code} · {item.point.region.name}</div></td>
              <td><span className={item.reviewStatus === 'APPROVED' ? 'pill active' : 'pill'}>{item.reviewStatus === 'APPROVED' ? 'ONAYLANDI / KAPANDI' : 'REDDEDİLDİ / AÇIK'}</span>{item.reviewNote ? <div className="muted">{item.reviewNote}</div> : null}</td>
              <td>{item.technician.name}{item.assistedForTechnician ? <div className="muted">{item.assistedForTechnician.name} için yardım</div> : null}</td>
              <td>{item.reviewedBy?.name || '—'}</td>
              <td>{item.reviewedAt ? new Date(item.reviewedAt).toLocaleString('tr-TR') : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="panel">
        <div className="panelHeader"><div><h2>Noktalar</h2><p>Aktif, pasif ve iptal noktaları buradan yönet.</p></div></div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Kod</th><th>Nokta</th><th>Bölge</th><th>Bakım</th><th>Durum</th></tr></thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.id}>
                  <td>{point.code}</td>
                  <td><strong>{point.name}</strong><div className="muted">{point.address || 'Adres yok'}</div></td>
                  <td>{point.region.name}</td>
                  <td>{point.maintenanceType === 'STANDARD' ? `Standart / Hafta ${point.maintenanceWeek}` : 'SmartClean'}</td>
                  <td><select value={point.status} onChange={(e) => void changePointStatus(point, e.target.value as Point['status'])} disabled={busy}>
                    <option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option>
                  </select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>        <form className="pointForm" onSubmit={createPoint}>
          <input value={pointForm.code} onChange={(e) => setPointForm({ ...pointForm, code: e.target.value })} placeholder="Nokta kodu" required />
          <input value={pointForm.name} onChange={(e) => setPointForm({ ...pointForm, name: e.target.value })} placeholder="Nokta adı" required />
          <select value={pointForm.regionId} onChange={(e) => setPointForm({ ...pointForm, regionId: e.target.value })} required>
            <option value="">Bölge seç</option>
            {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
          </select>
          <select value={pointForm.maintenanceType} onChange={(e) => setPointForm({ ...pointForm, maintenanceType: e.target.value })}>
            <option value="STANDARD">Standart</option><option value="SMARTCLEAN">SmartClean</option>
          </select>
          {pointForm.maintenanceType === 'STANDARD' ? (
            <select value={pointForm.maintenanceWeek} onChange={(e) => setPointForm({ ...pointForm, maintenanceWeek: e.target.value })}>
              <option value="1">Hafta 1</option><option value="2">Hafta 2</option>
            </select>
          ) : (
            <input type="date" value={pointForm.smartcleanReferenceAt} onChange={(e) => setPointForm({ ...pointForm, smartcleanReferenceAt: e.target.value })} required />
          )}
          <button disabled={busy || regions.length === 0} type="submit">NOKTA EKLE</button>
        </form>
      </section>
    </>
  );
}
