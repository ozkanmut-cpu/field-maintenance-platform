'use client';

import { useEffect, useState } from 'react';

type Capability = { capability: string; state: string; score: number; qualityScore: number; reasons: string[] };
type Baseline = { state: string; confidence: string; observedWeeks: number; serviceEvidenceWeeks: number; travelEvidenceWeeks: number; service: { completedVisits: { median: number | null; p75: number | null; p90: number | null } }; reasons: string[] };
type TechnicianRow = { id: string; name: string; username: string; baseline: Baseline; workload: { standardCurrent: number; standardCarryover: number; smartcleanCurrent: number; smartcleanCarryover: number; equipmentKnownPointCount: number; equipmentUnknownPointCount: number }; assessment: { evidenceState: string; baselineState: string; baselineConfidence: string; reasons: string[] } };
type Difficulty = { pointId: string; state: string; confidence: string; score: number | null; equipmentProfileComplete: boolean; geography: { located: boolean; isolated: boolean; nearestNeighborMeters: number | null }; history: { visits: number; attempts: number; missed: number; completed: number }; reasons: string[]; point: { code: string; name: string; region: { name: string } | null } | null };
type Dashboard = { weeks: number; currentWeek: string | null; generatedAt: string; maturity: { overallState: string; overallScore: number; evidence: { weeks: number; visits: number; attempts: number; activePoints: number; locatedPoints: number; locationCoverage: number }; capabilities: Capability[] }; unassigned: { standardCurrent: number; standardCarryover: number; smartcleanCurrent: number; smartcleanCarryover: number }; technicians: TechnicianRow[]; pointDifficulty: Difficulty[] };

const stateLabel = (value: string) => ({ INACTIVE: 'Pasif', WARMING_UP: 'Isınıyor', ACTIVE: 'Aktif', RELIABLE: 'Güvenilir', READY: 'Hazır', INSUFFICIENT_DATA: 'Veri yetersiz' }[value] ?? value);

export default function AiDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/backend/ai/admin-dashboard?weeks=12');
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || `HTTP ${response.status}`);
      setData(body as Dashboard);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  if (!data) return <section className="panel"><div className="panelHeader"><div><h2>Sanal İstatistikçi</h2><p>AI analizleri hazırlanıyor.</p></div></div>{error ? <div className="error banner">{error}</div> : <p>{busy ? 'Hesaplanıyor…' : 'Veri yok.'}</p>}</section>;

  const currentUnassigned = data.unassigned.standardCurrent + data.unassigned.smartcleanCurrent;
  return <>
    <section className="stats">
      <div className="stat"><strong>{data.maturity.overallScore}</strong><span>AI olgunluk skoru</span></div>
      <div className="stat"><strong>{stateLabel(data.maturity.overallState)}</strong><span>Genel durum</span></div>
      <div className="stat"><strong>{Math.round(data.maturity.evidence.locationCoverage * 100)}%</strong><span>Konum kapsaması</span></div>
      <div className="stat"><strong>{currentUnassigned}</strong><span>Atanmamış mevcut iş</span></div>
    </section>

    <section className="panel">
      <div className="panelHeader"><div><h2>Sanal İstatistikçi</h2><p>Son {data.weeks} haftalık veriden üretilen kapasite, risk ve veri olgunluğu görünümü.</p></div><button className="ghost" onClick={() => void load()} disabled={busy}>YENİLE</button></div>
      {error ? <div className="error banner">{error}</div> : null}
      <div className="tableWrap"><table><thead><tr><th>Yetenek</th><th>Durum</th><th>Skor</th><th>Veri kalitesi</th><th>Açıklama</th></tr></thead><tbody>
        {data.maturity.capabilities.map((item) => <tr key={item.capability}><td><strong>{item.capability}</strong></td><td><span className={item.state === 'ACTIVE' || item.state === 'RELIABLE' ? 'pill active' : 'pill'}>{stateLabel(item.state)}</span></td><td>{item.score}</td><td>{item.qualityScore}</td><td className="muted">{item.reasons.join(' · ')}</td></tr>)}
      </tbody></table></div>
    </section>

    <section className="panel"><div className="panelHeader"><div><h2>Teknisyen Kapasitesi</h2><p>Mevcut iş yükü ile öğrenilmiş haftalık baseline karşılaştırması.</p></div></div>
      <div className="tableWrap"><table><thead><tr><th>Teknisyen</th><th>Baseline</th><th>Mevcut iş</th><th>Devreden</th><th>Ekipman verisi</th><th>Medyan tamamlanan</th></tr></thead><tbody>
        {data.technicians.map((item) => { const current = item.workload.standardCurrent + item.workload.smartcleanCurrent; const carry = item.workload.standardCarryover + item.workload.smartcleanCarryover; return <tr key={item.id}><td><strong>{item.name}</strong><div className="muted">@{item.username}</div></td><td><span className={item.baseline.state === 'ACTIVE' ? 'pill active' : 'pill'}>{stateLabel(item.baseline.state)} / {item.baseline.confidence}</span><div className="muted">{item.baseline.observedWeeks} hafta gözlem</div></td><td>{current}</td><td>{carry}</td><td>{item.workload.equipmentKnownPointCount} bilinen / {item.workload.equipmentUnknownPointCount} eksik</td><td>{item.baseline.service.completedVisits.median ?? '—'}</td></tr>; })}
      </tbody></table></div>
    </section>

    <section className="panel"><div className="panelHeader"><div><h2>Nokta Zorluk Profili</h2><p>Aktif skorlar üstte; veri yetersiz noktalar warming-up olarak ayrıca görünür.</p></div></div>
      <div className="tableWrap"><table><thead><tr><th>Nokta</th><th>Skor</th><th>Durum</th><th>Ziyaret / Deneme</th><th>Konum</th><th>Neden</th></tr></thead><tbody>
        {data.pointDifficulty.slice(0, 40).map((item) => <tr key={item.pointId}><td><strong>{item.point?.name ?? item.pointId}</strong><div className="muted">{item.point?.code ?? '—'} · {item.point?.region?.name ?? 'Bölge yok'}</div></td><td>{item.score ?? '—'}</td><td><span className={item.state === 'ACTIVE' ? 'pill active' : 'pill'}>{stateLabel(item.state)} / {item.confidence}</span></td><td>{item.history.visits} / {item.history.attempts}</td><td>{item.geography.located ? item.geography.isolated ? 'İzole' : 'Konumlu' : 'Eksik'}</td><td className="muted">{item.reasons.join(' · ') || 'Yeterli veri'}</td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}
