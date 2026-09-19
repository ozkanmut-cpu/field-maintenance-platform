'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminIcon } from './admin-icons';
import KpiReportingPanel from './kpi-reporting';
import type { AdminSection } from './admin-navigation';
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
aliases?: string[];
status: 'ACTIVE' | 'PASSIVE' | 'CANCELLED';
maintenanceType: 'STANDARD' | 'SMARTCLEAN';
maintenanceWeek?: number | null;
smartcleanReferenceAt?: string | null;
region: Region | null;
};
type BulkPointAction = 'SET_REGION' | 'SET_STATUS' | 'SET_STANDARD_WEEK' | 'SET_SMARTCLEAN';
type SetupPendingReason = 'TEMPORARY_CODE' | 'REGION_MISSING' | 'TECHNICIAN_MISSING' | 'STANDARD_WEEK_MISSING' | 'SMARTCLEAN_REFERENCE_MISSING' | 'DUPLICATE_CODE';
type SetupPendingItem = Point & { setupReasons: SetupPendingReason[] };
type AttemptReviewItem = {
id: string; reason: 'BUSINESS_CLOSED' | 'AUTHORIZED_PERSON_UNAVAILABLE' | 'ACCESS_FAILED' | 'OTHER';
note?: string | null; attemptedAt: string;
point: { id: string; code: string; name: string; maintenanceType: 'STANDARD' | 'SMARTCLEAN'; region: { name: string } | null };
technician: { id: string; name: string; username: string };
assistedForTechnician?: { id: string; name: string; username: string } | null;
};
type AttemptHistoryItem = AttemptReviewItem & {
reviewStatus: 'APPROVED' | 'REJECTED'; reviewedAt?: string | null; reviewNote?: string | null;
closedDueDate?: string | null; reviewedBy?: { id: string; name: string; username: string } | null;
};
type DailyAdminSummary = {
date: string; generatedAt: string;
metrics: {
completedMaintenance: number; fieldTechnicianCount: number; attemptCount: number; nonMaintenanceVisitCount: number;
currentOpen: number; overdueOpen: number; unassignedOpen: number; paperworkPending: number; serviceSlipPending: number; confirmationPending: number;
};
technicians: Array<{ technicianId: string; name: string; username: string; completedMaintenance: number; attempts: number; nonMaintenanceVisits: number; currentOpen: number; overdueOpen: number }>;
};
type PeriodAdminSummary = {
selectedDate: string; weekStart: string; weekEnd: string; generatedAt: string;
metrics: DailyAdminSummary['metrics'];
technicians: DailyAdminSummary['technicians'];
};
type TechnicianDailySummary = {
date: string; generatedAt: string; technician: { id: string; name: string };
metrics: {
completedMaintenance: number; attemptCount: number; nonMaintenanceVisitCount: number; prospectVisitCount: number;
currentOpen: number; overdueOpen: number; helpedMaintenance: number; helpedAttempts: number;
receivedHelpMaintenance: number; receivedHelpAttempts: number;
};
paperwork: {
serviceSlip: { pending: number; present: number; missing: number };
confirmation: { pending: number; present: number; missing: number };
};
events: Array<{
id: string; type: 'MAINTENANCE' | 'ATTEMPT' | 'NON_MAINTENANCE_VISIT' | 'PROSPECT_VISIT';
relation: 'OWN' | 'HELPED_OTHER' | 'RECEIVED_HELP'; at: string; reason?: string; purpose?: string;
point?: { id: string; code: string; name: string } | null; prospect?: { id: string; name: string; sapNo?: string | null } | null;
serviceSlipStatus?: string; confirmationStatus?: string; technician?: { id: string; name: string; username: string } | null;
assistedForTechnician?: { id: string; name: string; username: string } | null;
}>;
};
function istanbulDateKey() {
return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function shiftDateKey(dateKey: string, days: number) {
const date = new Date(`${dateKey}T12:00:00.000Z`);
date.setUTCDate(date.getUTCDate() + days);
return date.toISOString().slice(0, 10);
}
export type OperationsSection = 'dashboard' | 'approvals' | 'setup-pending' | 'regions' | 'points';
type Section = OperationsSection;
type Props = { users: Technician[]; activeSection: Section; onNavigate: (section: AdminSection, values?: { pointId?: string; detailTab?: string }) => void };
export default function Operations({ users, activeSection, onNavigate }: Props) {
const [regions, setRegions] = useState<Region[]>([]);
const [points, setPoints] = useState<Point[]>([]);
const [setupPending, setSetupPending] = useState<SetupPendingItem[]>([]);
const [attemptQueue, setAttemptQueue] = useState<AttemptReviewItem[]>([]);
const [attemptHistory, setAttemptHistory] = useState<AttemptHistoryItem[]>([]);
const [dailySummaryDate, setDailySummaryDate] = useState(istanbulDateKey);
const [dailySummary, setDailySummary] = useState<DailyAdminSummary | null>(null);
const [dailySummaryLoading, setDailySummaryLoading] = useState(false);
const [periodSummaryDate, setPeriodSummaryDate] = useState(istanbulDateKey);
const [periodSummary, setPeriodSummary] = useState<PeriodAdminSummary | null>(null);
const [periodSummaryLoading, setPeriodSummaryLoading] = useState(false);
const [technicianDailySummaryDate, setTechnicianDailySummaryDate] = useState(istanbulDateKey);
const [technicianDailySummaryTechnicianId, setTechnicianDailySummaryTechnicianId] = useState('');
const [technicianDailySummary, setTechnicianDailySummary] = useState<TechnicianDailySummary | null>(null);
const [technicianDailySummaryLoading, setTechnicianDailySummaryLoading] = useState(false);
const [busy, setBusy] = useState(false);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
const [pointSearch, setPointSearch] = useState('');
const [pointStatusFilter, setPointStatusFilter] = useState<'ALL' | Point['status']>('ALL');
const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
const [bulkAction, setBulkAction] = useState<BulkPointAction>('SET_REGION');
const [bulkRegionId, setBulkRegionId] = useState('');
const [bulkStatus, setBulkStatus] = useState<Point['status']>('ACTIVE');
const [bulkWeek, setBulkWeek] = useState('1');
const [bulkSmartcleanReferenceAt, setBulkSmartcleanReferenceAt] = useState('');
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
const reviewedAttemptCounts = useMemo(() => ({
approved: attemptHistory.filter((item) => item.reviewStatus === 'APPROVED').length,
rejected: attemptHistory.filter((item) => item.reviewStatus === 'REJECTED').length,
}), [attemptHistory]);
useEffect(() => {
setTechnicianDailySummaryTechnicianId((current) => current || technicians[0]?.id || '');
}, [technicians]);
const visiblePoints = useMemo(() => {
const q = pointSearch.trim().toLocaleLowerCase('tr-TR');
return points.filter((point) => {
const statusOk = pointStatusFilter === 'ALL' || point.status === pointStatusFilter;
const searchValues = [
point.code,
point.name,
point.address ?? '',
point.region?.name ?? '',
...(point.aliases ?? []),
];
const searchOk = !q || searchValues.join(' ').toLocaleLowerCase('tr-TR').includes(q);
return statusOk && searchOk;
});
}, [points, pointSearch, pointStatusFilter]);
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
async function loadDailySummary(date = dailySummaryDate) {
if (!date) { setDailySummary(null); return; }
setDailySummary(null);
setDailySummaryLoading(true);
try {
setDailySummary(await api<DailyAdminSummary>(`/api/backend/maintenance/admin-daily-summary?date=${encodeURIComponent(date)}`));
} finally { setDailySummaryLoading(false); }
}
async function loadPeriodSummary(date = periodSummaryDate) {
if (!date) { setPeriodSummary(null); return; }
setPeriodSummary(null);
setPeriodSummaryLoading(true);
try {
setPeriodSummary(await api<PeriodAdminSummary>(`/api/backend/maintenance/admin-period-summary?date=${encodeURIComponent(date)}`));
} finally { setPeriodSummaryLoading(false); }
}
async function loadTechnicianDailySummary(technicianId = technicianDailySummaryTechnicianId, date = technicianDailySummaryDate) {
if (!technicianId || !date) { setTechnicianDailySummary(null); return; }
setTechnicianDailySummary(null);
setTechnicianDailySummaryLoading(true);
try {
setTechnicianDailySummary(await api<TechnicianDailySummary>(`/api/backend/maintenance/admin-technician-daily-summary?technicianId=${encodeURIComponent(technicianId)}&date=${encodeURIComponent(date)}`));
} finally { setTechnicianDailySummaryLoading(false); }
}
async function load() {
setLoading(true);
try {
const [regionList, pointList, setupQueue, attemptReview, reviewHistory] = await Promise.all([
api<Region[]>('/api/backend/regions'),
api<Point[]>('/api/backend/points'),
api<{ count: number; items: SetupPendingItem[] }>('/api/backend/points/setup-pending'),
api<{ count: number; items: AttemptReviewItem[] }>('/api/backend/maintenance/attempt-review-queue'),
api<{ count: number; items: AttemptHistoryItem[] }>('/api/backend/maintenance/attempt-review-history?limit=20'),
]);
setRegions(regionList);
setPoints(pointList);
setSetupPending(setupQueue.items);
setAttemptQueue(attemptReview.items);
setAttemptHistory(reviewHistory.items);
setPointForm((current) => ({ ...current, regionId: current.regionId || regionList[0]?.id || '' }));
setBulkRegionId((current) => current || regionList[0]?.id || '');
} finally { setLoading(false); }
}
useEffect(() => {
void load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
}, []);
useEffect(() => {
if (activeSection !== 'dashboard') return;
void loadDailySummary().catch((e) => setError(e instanceof Error ? e.message : String(e)));
}, [dailySummaryDate, activeSection]);
useEffect(() => {
if (activeSection !== 'dashboard') return;
void loadPeriodSummary().catch((e) => setError(e instanceof Error ? e.message : String(e)));
}, [periodSummaryDate, activeSection]);
useEffect(() => {
if (activeSection !== 'dashboard' || !technicianDailySummaryTechnicianId) return;
void loadTechnicianDailySummary().catch((e) => setError(e instanceof Error ? e.message : String(e)));
}, [technicianDailySummaryTechnicianId, technicianDailySummaryDate, activeSection]);
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
if (status !== 'ACTIVE' && !window.confirm(`${point.name} noktası ${status === 'PASSIVE' ? 'pasife' : 'iptale'} alınacak. Devam edilsin mi?`)) return;
setBusy(true); setError('');
try {
await api(`/api/backend/points/${point.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
await load();
} catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
function handlePointSearchChange(value: string) {
setPointSearch(value);
setSelectedPointIds([]);
}
function handlePointStatusFilterChange(value: typeof pointStatusFilter) {
setPointStatusFilter(value);
setSelectedPointIds([]);
}
function togglePointSelection(pointId: string) {
setSelectedPointIds((current) => current.includes(pointId) ? current.filter((id) => id !== pointId) : [...current, pointId]);
}
function selectVisiblePoints() {
setSelectedPointIds(visiblePoints.map((point) => point.id));
}
function clearPointSelection() { setSelectedPointIds([]); }
async function bulkUpdatePoints() {
if (!selectedPointIds.length) { setError('Toplu işlem için en az bir nokta seçin.'); return; }
if (selectedPointIds.length > 500) { setError('En fazla 500 nokta tek toplu işlemde güncellenebilir.'); return; }
const payload: Record<string, unknown> = { pointIds: selectedPointIds, action: bulkAction };
let description = '';
if (bulkAction === 'SET_REGION') {
const region = regions.find((item) => item.id === bulkRegionId);
if (!region) { setError('Geçerli bir hedef bölge seçin.'); return; }
payload.regionId = region.id; description = `bölgesi ${region.name} yapılacak`;
} else if (bulkAction === 'SET_STATUS') {
payload.status = bulkStatus; description = `durumu ${bulkStatus === 'ACTIVE' ? 'Aktif' : bulkStatus === 'PASSIVE' ? 'Pasif' : 'İptal'} yapılacak`;
} else if (bulkAction === 'SET_STANDARD_WEEK') {
payload.maintenanceWeek = Number(bulkWeek); description = `bakımı Standart / Hafta ${bulkWeek} yapılacak`;
} else {
if (!bulkSmartcleanReferenceAt) { setError('SmartClean referans tarihi zorunludur.'); return; }
payload.maintenanceWeek = Number(bulkWeek);
payload.smartcleanReferenceAt = bulkSmartcleanReferenceAt;
description = `bakımı SmartClean / Hafta ${bulkWeek}, referans ${bulkSmartcleanReferenceAt} yapılacak`;
}
if (!window.confirm(`${selectedPointIds.length} nokta için ${description}. Devam edilsin mi?`)) return;
setBusy(true); setError('');
try {
await api('/api/backend/points/bulk-update', { method: 'POST', body: JSON.stringify(payload) });
clearPointSelection();
await load();
} catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}

async function fixSetup(point: SetupPendingItem, reason: SetupPendingReason) {
let payload: Record<string, unknown> | null = null;
if (reason === 'REGION_MISSING') {
const choices = regions.filter((region) => !/^(BELİRLENMEDİ|BELIRLENMEDI|AYAR BEKLİYOR|AYAR BEKLIYOR)$/i.test(region.name));
const value = window.prompt(`Bölge adını girin:\n${choices.map((region) => region.name).join(', ')}`);
if (value === null) return;
const selected = choices.find((region) => region.name.toLocaleLowerCase('tr-TR') === value.trim().toLocaleLowerCase('tr-TR'));
if (!selected) { setError('Listede bulunan geçerli bir bölge adı girilmelidir.'); return; }
payload = { regionId: selected.id };
} else if (reason === 'STANDARD_WEEK_MISSING') {
const value = window.prompt('Rut haftası seçin: 1 veya 2');
if (value === null) return;
if (value !== '1' && value !== '2') {
setError('Rut haftası yalnızca 1 veya 2 olabilir. 0 manuel girilemez.');
return;
}
payload = { maintenanceWeek: Number(value) };
} else if (reason === 'TECHNICIAN_MISSING') {
setError('Bu noktanın bölgesine önce Bölge bölümünden aktif teknisyen atayın.');
return;
} else if (reason === 'DUPLICATE_CODE') {
const value = window.prompt('Bu nokta için doğru benzersiz müşteri numarasını girin:', point.code);
if (value === null) return;
const code = value.trim();
if (!code || code === point.code) { setError('Farklı ve geçerli bir müşteri numarası girilmelidir.'); return; }
payload = { code };
} else if (reason === 'TEMPORARY_CODE') {
const value = window.prompt('Gerçek müşteri numarasını girin:', point.code);
if (value === null) return;
const code = value.trim();
if (!code || /^GECICI-/i.test(code)) {
setError('Geçerli gerçek müşteri numarası girilmelidir.');
return;
}
payload = { code };
} else {
const value = window.prompt('SmartClean referans tarihi (YYYY-MM-DD):');
if (value === null) return;
if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
setError('Tarih YYYY-MM-DD formatında olmalıdır.');
return;
}
payload = { smartcleanReferenceAt: value.trim() };
}
setBusy(true); setError('');
try {
await api(`/api/backend/points/${point.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
await load();
} catch (e) { setError(e instanceof Error ? e.message : String(e)); }
finally { setBusy(false); }
}
function setupReasonLabel(reason: SetupPendingReason) {
if (reason === 'REGION_MISSING') return 'Bölge bekliyor';
if (reason === 'STANDARD_WEEK_MISSING') return 'Rut haftası bekliyor';
if (reason === 'TEMPORARY_CODE') return 'Geçici müşteri no';
if (reason === 'TECHNICIAN_MISSING') return 'Teknisyen bekliyor';
if (reason === 'DUPLICATE_CODE') return 'Mükerrer müşteri no';
return 'SmartClean referans tarihi bekliyor';
}
function setupDetailTab(reason: SetupPendingReason) {
return reason === 'STANDARD_WEEK_MISSING' || reason === 'SMARTCLEAN_REFERENCE_MISSING' ? 'maintenance' : reason === 'TECHNICIAN_MISSING' ? 'assignments' : 'general';
}
return (
<>
{error ? <div className="error banner">{error}</div> : null}
{activeSection === 'dashboard' ? <>
<section className="dashboardGrid">
<button className="dashboardCard" onClick={() => onNavigate('setup-pending')}><span>Ayar bekleyen</span><strong>{setupPending.length}</strong><small>Eksik ayarları tamamla</small></button>
<button className="dashboardCard" onClick={() => onNavigate('approvals')}><span>Bekleyen onay</span><strong>{attemptQueue.length}</strong><small>Yapılamadı kayıtlarını incele</small></button>
<button className="dashboardCard" onClick={() => onNavigate('points')}><span>Noktalar</span><strong>{points.length}</strong><small>Nokta listesini yönet</small></button>
<button className="dashboardCard" onClick={() => onNavigate('regions')}><span>Bölgeler</span><strong>{regions.length}</strong><small>Bölge ve sorumluları yönet</small></button>
</section>
<section className="panel">
<div className="panelHeader"><div><h2>Günlük Operasyon Özeti</h2><p>Seçilen İstanbul iş günü için saha hareketi, açık işler ve evrak yükü.</p></div><div className="rowActions"><input type="date" value={dailySummaryDate} onChange={(e) => setDailySummaryDate(e.target.value)} aria-label="Günlük özet tarihi" /><button className="ghost iconAction" onClick={() => void loadDailySummary().catch((e) => setError(e instanceof Error ? e.message : String(e)))} disabled={dailySummaryLoading}><AdminIcon name="refresh" size={17} /><span>{dailySummaryLoading ? 'YÜKLENİYOR' : 'YENİLE'}</span></button></div></div>
{dailySummary ? <>
<section className="dashboardGrid">
<div className="dashboardCard"><span>Tamamlanan bakım</span><strong>{dailySummary.metrics.completedMaintenance}</strong><small>{dailySummary.date}</small></div>
<div className="dashboardCard"><span>Sahada çalışan teknisyen</span><strong>{dailySummary.metrics.fieldTechnicianCount}</strong><small>En az bir saha işlemi</small></div>
<div className="dashboardCard"><span>Yapılamadı / diğer ziyaret</span><strong>{dailySummary.metrics.attemptCount} / {dailySummary.metrics.nonMaintenanceVisitCount}</strong><small>Günün saha olayları</small></div>
<div className="dashboardCard"><span>Bu dönem açık iş</span><strong>{dailySummary.metrics.currentOpen}</strong><small>Geciken hariç</small></div>
</section>
<div className="tableWrap"><table><thead><tr><th>Dikkat alanı</th><th>Adet</th><th>Açıklama</th></tr></thead><tbody>
<tr><td><strong>Geciken açık iş</strong></td><td>{dailySummary.metrics.overdueOpen}</td><td className="muted">Bakım penceresi geçmiş işler</td></tr>
<tr><td><strong>Atanmamış açık iş</strong></td><td>{dailySummary.metrics.unassignedOpen}</td><td className="muted">Etkin teknisyeni bulunmayan açık işler</td></tr>
<tr><td><strong>Bekleyen evrak</strong></td><td>{dailySummary.metrics.paperworkPending}</td><td className="muted">Servis fişi {dailySummary.metrics.serviceSlipPending} · Teyit {dailySummary.metrics.confirmationPending}</td></tr>
<tr><td><strong>Ayar bekleyen nokta</strong></td><td>{setupPending.length}</td><td className="muted">Eksik operasyon ayarı</td></tr>
<tr><td><strong>Bekleyen yönetici onayı</strong></td><td>{attemptQueue.length}</td><td className="muted">Yapılamadı inceleme kuyruğu</td></tr>
</tbody></table></div>
<div className="tableWrap"><table><thead><tr><th>Teknisyen günlük dağılımı</th><th>Bakım</th><th>Yapılamadı</th><th>Diğer ziyaret</th><th>Bu dönem açık</th><th>Geciken</th></tr></thead><tbody>
{dailySummary.technicians.map((item) => <tr key={item.technicianId}><td><strong>{item.name}</strong><div className="muted">@{item.username}</div></td><td>{item.completedMaintenance}</td><td>{item.attempts}</td><td>{item.nonMaintenanceVisits}</td><td>{item.currentOpen}</td><td>{item.overdueOpen}</td></tr>)}
</tbody></table></div>
</> : <div className="emptyState compact"><AdminIcon name="clock" /><strong>Günlük özet hazırlanıyor</strong><span>Seçili günün operasyon verileri yükleniyor.</span></div>}
</section>
<section className="panel">
<div className="panelHeader"><div><h2>Haftalık / Dönem Sonu Özeti</h2><p>Seçilen tarihin ait olduğu Pazartesi–Pazar İstanbul haftasının operasyon görünümü.</p></div><div className="rowActions"><button className="ghost small" onClick={() => setPeriodSummaryDate((current) => shiftDateKey(current, -7))}>ÖNCEKİ HAFTA</button><input type="date" value={periodSummaryDate} onChange={(e) => setPeriodSummaryDate(e.target.value)} aria-label="Haftalık özet tarihi" /><button className="ghost small" disabled={shiftDateKey(periodSummaryDate, 7) > istanbulDateKey()} onClick={() => setPeriodSummaryDate((current) => shiftDateKey(current, 7))}>SONRAKİ HAFTA</button><button className="ghost iconAction" onClick={() => void loadPeriodSummary().catch((e) => setError(e instanceof Error ? e.message : String(e)))} disabled={periodSummaryLoading}><AdminIcon name="refresh" size={17} /><span>{periodSummaryLoading ? 'YÜKLENİYOR' : 'YENİLE'}</span></button></div></div>
{periodSummary ? <>
<p className="muted"><strong>{periodSummary.weekStart}</strong> – <strong>{periodSummary.weekEnd}</strong></p>
<section className="dashboardGrid">
<div className="dashboardCard"><span>Tamamlanan bakım</span><strong>{periodSummary.metrics.completedMaintenance}</strong><small>Haftalık toplam</small></div>
<div className="dashboardCard"><span>Sahada çalışan teknisyen</span><strong>{periodSummary.metrics.fieldTechnicianCount}</strong><small>Hafta içinde en az bir saha işlemi</small></div>
<div className="dashboardCard"><span>Yapılamadı / diğer ziyaret</span><strong>{periodSummary.metrics.attemptCount} / {periodSummary.metrics.nonMaintenanceVisitCount}</strong><small>Haftalık saha olayları</small></div>
<div className="dashboardCard"><span>Hafta sonu açık iş</span><strong>{periodSummary.metrics.currentOpen}</strong><small>Geciken hariç</small></div>
</section>
<div className="tableWrap"><table><thead><tr><th>Dikkat alanı</th><th>Adet</th><th>Açıklama</th></tr></thead><tbody>
<tr><td><strong>Geciken açık iş</strong></td><td>{periodSummary.metrics.overdueOpen}</td><td className="muted">Hafta sonu snapshot</td></tr>
<tr><td><strong>Atanmamış açık iş</strong></td><td>{periodSummary.metrics.unassignedOpen}</td><td className="muted">Hafta sonu etkin teknisyeni olmayan işler</td></tr>
<tr><td><strong>Bekleyen evrak</strong></td><td>{periodSummary.metrics.paperworkPending}</td><td className="muted">Servis fişi {periodSummary.metrics.serviceSlipPending} · Teyit {periodSummary.metrics.confirmationPending} · Seçili hafta sonuna kadar oluşmuş ve halen bekleyen</td></tr>
</tbody></table></div>
<div className="tableWrap"><table><thead><tr><th>Teknisyen haftalık dağılımı</th><th>Bakım</th><th>Yapılamadı</th><th>Diğer ziyaret</th><th>Hafta sonu açık</th><th>Geciken</th></tr></thead><tbody>
{periodSummary.technicians.map((item) => <tr key={item.technicianId}><td><strong>{item.name}</strong><div className="muted">@{item.username}</div></td><td>{item.completedMaintenance}</td><td>{item.attempts}</td><td>{item.nonMaintenanceVisits}</td><td>{item.currentOpen}</td><td>{item.overdueOpen}</td></tr>)}
</tbody></table></div>
</> : <div className="emptyState compact"><AdminIcon name="clock" /><strong>Haftalık özet hazırlanıyor</strong><span>Seçili haftanın operasyon verileri yükleniyor.</span></div>}
</section>
<section className="panel">
<div className="panelHeader"><div><h2>Teknisyen Günlük Özeti</h2><p>Seçilen teknisyenin İstanbul iş günündeki kendi işi, yardım hareketleri, açık görevleri ve evrak durumu.</p></div><div className="rowActions"><select value={technicianDailySummaryTechnicianId} onChange={(e) => setTechnicianDailySummaryTechnicianId(e.target.value)} aria-label="Teknisyen seç"><option value="">Teknisyen seç</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select><input type="date" value={technicianDailySummaryDate} onChange={(e) => setTechnicianDailySummaryDate(e.target.value)} aria-label="Teknisyen özet tarihi" /><button className="ghost iconAction" onClick={() => void loadTechnicianDailySummary().catch((e) => setError(e instanceof Error ? e.message : String(e)))} disabled={technicianDailySummaryLoading || !technicianDailySummaryTechnicianId}><AdminIcon name="refresh" size={17} /><span>{technicianDailySummaryLoading ? 'YÜKLENİYOR' : 'YENİLE'}</span></button></div></div>
{technicianDailySummary ? <>
<p className="muted"><strong>{technicianDailySummary.technician.name}</strong> · {technicianDailySummary.date}</p>
<section className="dashboardGrid">
<div className="dashboardCard"><span>Kendi bakımı</span><strong>{technicianDailySummary.metrics.completedMaintenance}</strong><small>Başka teknisyen adına yapılanlar hariç</small></div>
<div className="dashboardCard"><span>Yapılamadı / diğer / prospect</span><strong>{technicianDailySummary.metrics.attemptCount} / {technicianDailySummary.metrics.nonMaintenanceVisitCount} / {technicianDailySummary.metrics.prospectVisitCount}</strong><small>Kendi saha hareketleri</small></div>
<div className="dashboardCard"><span>Gün sonu açık / geciken</span><strong>{technicianDailySummary.metrics.currentOpen} / {technicianDailySummary.metrics.overdueOpen}</strong><small>Tarihsel görev snapshot</small></div>
<div className="dashboardCard"><span>Yardım verdi</span><strong>{technicianDailySummary.metrics.helpedMaintenance} / {technicianDailySummary.metrics.helpedAttempts}</strong><small>Bakım / yapılamadı</small></div>
<div className="dashboardCard"><span>Yardım aldı</span><strong>{technicianDailySummary.metrics.receivedHelpMaintenance} / {technicianDailySummary.metrics.receivedHelpAttempts}</strong><small>Başka teknisyenin onun adına yaptığı</small></div>
</section>
<div className="tableWrap"><table><thead><tr><th>Evrak</th><th>Bekliyor</th><th>Var</th><th>Eksik</th></tr></thead><tbody>
<tr><td><strong>Servis fişi</strong></td><td>{technicianDailySummary.paperwork.serviceSlip.pending}</td><td>{technicianDailySummary.paperwork.serviceSlip.present}</td><td>{technicianDailySummary.paperwork.serviceSlip.missing}</td></tr>
<tr><td><strong>Teyit</strong></td><td>{technicianDailySummary.paperwork.confirmation.pending}</td><td>{technicianDailySummary.paperwork.confirmation.present}</td><td>{technicianDailySummary.paperwork.confirmation.missing}</td></tr>
</tbody></table></div>
<div className="tableWrap"><table><thead><tr><th>Gün içi hareketler</th><th>Tür</th><th>Nokta / müşteri</th><th>İlişki</th><th>Detay</th></tr></thead><tbody>
{technicianDailySummary.events.length === 0 ? <tr><td colSpan={5}>Seçili günde saha hareketi yok.</td></tr> : technicianDailySummary.events.map((item) => <tr key={`${item.type}-${item.id}`}><td>{new Date(item.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</td><td>{item.type === 'MAINTENANCE' ? 'Bakım' : item.type === 'ATTEMPT' ? 'Yapılamadı' : item.type === 'NON_MAINTENANCE_VISIT' ? 'Diğer ziyaret' : 'Prospect'}</td><td><strong>{item.point?.name || item.prospect?.name || '—'}</strong>{item.point?.code ? <div className="muted">{item.point.code}</div> : null}</td><td>{item.relation === 'HELPED_OTHER' ? 'Yardım verdi' : item.relation === 'RECEIVED_HELP' ? `Yardım aldı${item.technician?.name ? ` · ${item.technician.name}` : ''}` : 'Kendi işi'}</td><td className="muted">{item.type === 'MAINTENANCE' ? `Servis fişi: ${item.serviceSlipStatus ?? '—'} · Teyit: ${item.confirmationStatus ?? '—'}` : item.reason || item.purpose || '—'}</td></tr>)}
</tbody></table></div>
</> : <div className="emptyState compact"><AdminIcon name="clock" /><strong>Teknisyen özeti hazırlanıyor</strong><span>Teknisyen ve tarih seçimine göre günlük operasyon verileri yükleniyor.</span></div>}
</section>
<KpiReportingPanel technicians={technicians} />
</> : null}
{activeSection === 'regions' ? <section className="panel" id="regions">
<div className="panelHeader">
<div><h2>Bölgeler</h2><p>Bölge sorumlularını ve nokta dağılımını yönet.</p></div>
<button className="ghost iconAction" onClick={() => void load()} disabled={busy || loading}><AdminIcon name="refresh" size={17} /><span>{loading ? 'Yükleniyor' : 'Yenile'}</span></button>
</div>
<div className="tableWrap">
<table>
<thead><tr><th>Bölge</th><th>Nokta</th><th>Teknisyen</th></tr></thead>
<tbody>
{loading ? <tr><td colSpan={3}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Veriler yükleniyor</strong><span>Bölge listesi hazırlanıyor.</span></div></td></tr> : regions.length === 0 ? <tr><td colSpan={3}><div className="emptyState compact"><AdminIcon name="regions" /><strong>Henüz bölge yok</strong><span>Aşağıdaki formdan ilk bölgeyi ekleyebilirsin.</span></div></td></tr> : regions.map((region) => (
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
</section> : null}
{activeSection === 'setup-pending' ? <section className="panel priorityPanel" id="setup-pending">
<div className="panelHeader">
<div><h2>Ayar Bekleyen Noktalar</h2><p>Eksik veya geçici ayarı olan aktif noktalar otomatik olarak burada görünür. Düzeltildiğinde listeden kendiliğinden çıkar.</p></div>
<span className="pill">{setupPending.length} bekliyor</span>
</div>
<div className="tableWrap">
<table>
<thead><tr><th>Nokta</th><th>Bölge</th><th>Bekleyen ayar</th><th></th></tr></thead>
<tbody>
{loading ? <tr><td colSpan={4}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Kontrol ediliyor</strong><span>Ayar bekleyen noktalar taranıyor.</span></div></td></tr> : setupPending.length === 0 ? <tr><td colSpan={4}><div className="emptyState compact success"><AdminIcon name="check" /><strong>Her şey tamam</strong><span>Ayar bekleyen aktif nokta bulunmuyor.</span></div></td></tr> : setupPending.map((point) => (
<tr key={point.id}>
<td><strong>{point.name}</strong><div className="muted">{point.code}</div></td>
<td>{point.region?.name || 'Bölge bekliyor'}</td>
<td>{point.setupReasons.map((reason) => <div key={reason}><span className="pill">{setupReasonLabel(reason)}</span></div>)}</td>
<td className="actions">{point.setupReasons.map((reason) => (
<button className="small" key={reason} onClick={() => onNavigate('point-detail', { pointId: point.id, detailTab: setupDetailTab(reason) })}>Detayda Düzelt</button>
))}</td>
</tr>
))}
</tbody>
</table>
</div>
</section> : null}
{activeSection === 'approvals' ? <>
<section className="panel priorityPanel" id="approvals">
<div className="panelHeader">
<div><h2>Bekleyen Yapılamadı Onayları</h2><p>Teknisyenin kapatamadığı bakım görevlerini incele. Onaylanan görev kapanır; reddedilen görev açık kalır.</p></div>
<span className="pill">{attemptQueue.length} bekliyor</span>
</div>
<section className="dashboardGrid" aria-label="Yapılamadı onay özeti">
<div className="dashboardCard"><span>Bekleyen kayıtlar</span><strong>{attemptQueue.length}</strong><small>Yönetici kararı gerekiyor</small></div>
<div className="dashboardCard"><span>Son 20 onay</span><strong>{reviewedAttemptCounts.approved}</strong><small>İlgili görev kapatıldı</small></div>
<div className="dashboardCard"><span>Son 20 ret</span><strong>{reviewedAttemptCounts.rejected}</strong><small>İlgili görev açık kaldı</small></div>
</section>
<div className="tableWrap">
<table>
<thead><tr><th>Nokta</th><th>Teknisyen</th><th>Neden / not</th><th>Tarih</th><th>İşlem</th></tr></thead>
<tbody>
{loading ? <tr><td colSpan={5}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Onaylar yükleniyor</strong><span>Bekleyen kayıtlar getiriliyor.</span></div></td></tr> : attemptQueue.length === 0 ? <tr><td colSpan={5}><div className="emptyState compact success"><AdminIcon name="check" /><strong>Bekleyen onay yok</strong><span>İncelenmesi gereken yapılamadı kaydı bulunmuyor.</span></div></td></tr> : attemptQueue.map((item) => (
<tr key={item.id}>
<td><strong>{item.point.name}</strong><div className="muted">{item.point.code} · {item.point.region?.name || 'Bölge yok'}</div></td>
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
<td><strong>{item.point.name}</strong><div className="muted">{item.point.code} · {item.point.region?.name || 'Bölge yok'}</div></td>
<td><span className={item.reviewStatus === 'APPROVED' ? 'pill active' : 'pill'}>{item.reviewStatus === 'APPROVED' ? 'ONAYLANDI / KAPANDI' : 'REDDEDİLDİ / AÇIK'}</span>{item.reviewNote ? <div className="muted">{item.reviewNote}</div> : null}</td>
<td>{item.technician.name}{item.assistedForTechnician ? <div className="muted">{item.assistedForTechnician.name} için yardım</div> : null}</td>
<td>{item.reviewedBy?.name || '—'}</td>
<td>{item.reviewedAt ? new Date(item.reviewedAt).toLocaleString('tr-TR') : '—'}</td>
</tr>
))}</tbody>
</table></div>
</section>
</> : null}
{activeSection === 'points' ? <section className="panel" id="points">
<div className="panelHeader"><div><h2>Noktalar</h2><p>Aktif, pasif ve iptal noktaları buradan yönet.</p></div><button className="ghost iconAction" onClick={() => void load()} disabled={busy || loading}><AdminIcon name="refresh" size={17} /><span>{loading ? 'Yükleniyor' : 'Yenile'}</span></button></div>
<div className="filterBar">
<label className="searchField"><AdminIcon name="search" size={18} /><input value={pointSearch} onChange={(e) => handlePointSearchChange(e.target.value)} placeholder="Kod, nokta, adres veya bölge ara" /></label>
<select value={pointStatusFilter} onChange={(e) => handlePointStatusFilterChange(e.target.value as typeof pointStatusFilter)}><option value="ALL">Tüm durumlar</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select>
<span className="filterCount">{visiblePoints.length} / {points.length} nokta</span>
<button className="small" disabled={busy || !visiblePoints.length} onClick={selectVisiblePoints}>GÖRÜNENLERİ SEÇ</button>
<button className="ghost small" disabled={busy || !selectedPointIds.length} onClick={clearPointSelection}>SEÇİMİ TEMİZLE</button>
</div>
<div className="filterBar">
<strong>{selectedPointIds.length} seçili</strong>
<select value={bulkAction} onChange={(e) => setBulkAction(e.target.value as BulkPointAction)}>
<option value="SET_REGION">Bölge değiştir</option><option value="SET_STATUS">Durum değiştir</option><option value="SET_STANDARD_WEEK">Standart rut haftası</option><option value="SET_SMARTCLEAN">SmartClean yap</option>
</select>
{bulkAction === 'SET_REGION' ? <select value={bulkRegionId} onChange={(e) => setBulkRegionId(e.target.value)}><option value="">Hedef bölge seç</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select> : null}
{bulkAction === 'SET_STATUS' ? <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as Point['status'])}><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option></select> : null}
{bulkAction === 'SET_STANDARD_WEEK' || bulkAction === 'SET_SMARTCLEAN' ? <select value={bulkWeek} onChange={(e) => setBulkWeek(e.target.value)}><option value="1">Hafta 1</option><option value="2">Hafta 2</option></select> : null}
{bulkAction === 'SET_SMARTCLEAN' ? <input type="date" value={bulkSmartcleanReferenceAt} onChange={(e) => setBulkSmartcleanReferenceAt(e.target.value)} aria-label="SmartClean referans tarihi" /> : null}
<button disabled={busy || !selectedPointIds.length} onClick={() => void bulkUpdatePoints()}>SEÇİLİLERE UYGULA</button>
</div>
<div className="tableWrap">
<table>
<thead><tr><th>Seç</th><th>Kod</th><th>Nokta</th><th>Bölge</th><th>Bakım</th><th>Durum</th></tr></thead>
<tbody>
{loading ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="clock" /><strong>Noktalar yükleniyor</strong><span>Liste hazırlanıyor.</span></div></td></tr> : visiblePoints.length === 0 ? <tr><td colSpan={6}><div className="emptyState compact"><AdminIcon name="search" /><strong>Sonuç bulunamadı</strong><span>Arama veya durum filtresini değiştir.</span></div></td></tr> : visiblePoints.map((point) => (
<tr key={point.id}>
<td><input type="checkbox" checked={selectedPointIds.includes(point.id)} onChange={() => togglePointSelection(point.id)} aria-label={`${point.name} seç`} /></td>
<td>{point.code}</td>
<td><strong>{point.name}</strong><div className="muted">{point.address || 'Adres yok'}</div></td>
<td>{point.region?.name || 'Bölge bekliyor'}</td>
<td>{point.maintenanceType === 'STANDARD' ? point.maintenanceWeek ? `Standart / Hafta ${point.maintenanceWeek}` : 'Standart / Ayar bekliyor' : 'SmartClean'}</td>
<td><select value={point.status} onChange={(e) => void changePointStatus(point, e.target.value as Point['status'])} disabled={busy}>
<option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option><option value="CANCELLED">İptal</option>
</select></td>
</tr>
))}
</tbody>
</table>
</div><form className="pointForm" onSubmit={createPoint}>
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
</section> : null}
</>
);
}
