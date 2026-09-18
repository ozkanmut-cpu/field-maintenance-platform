'use client';

import { FormEvent, useEffect, useState } from 'react';
import Operations from './operations';
import LocationMatching from './location-matching';
import AiDashboard from './ai-dashboard';
import AnomalyReview from './anomaly-review';
import MaintenanceCalendar from './maintenance-calendar';
import Prospects from './prospects';
import AuditLog from './audit-log';
import AssignmentManagement from './assignment-management';
import PaperworkManagement from './paperwork-management';
import PointTimeline from './point-timeline';
import DuplicateSuggestions from './duplicate-suggestions';
import NonMaintenanceVisits from './non-maintenance-visits';
import SapSyncStatus from './sap-sync-status';
import AdminShell from './admin-shell';
import { buildAdminLocation, parseAdminLocation, type AdminLocation, type AdminSection } from './admin-navigation';
import PointList from './point-list';
import PointDetailPage from './point-detail-page';
import BulkOperations from './bulk-operations';
import KpiReportingPanel from './kpi-reporting';
import TechnicianDailySummaryPanel from './technician-daily-summary';

type User = {
  id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'TECHNICIAN';
  active: boolean;
  lastLoginAt?: string | null;
};

type NewUser = {
  name: string;
  username: string;
  role: 'ADMIN' | 'TECHNICIAN';
  password: string;
};

const emptyUser: NewUser = { name: '', username: '', role: 'TECHNICIAN', password: '' };

export default function Home() {
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newUser, setNewUser] = useState<NewUser>(emptyUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [helpEditorId, setHelpEditorId] = useState('');
  const [helpTargetIds, setHelpTargetIds] = useState<string[]>([]);
  const [location, setLocation] = useState<AdminLocation>(() => typeof window === 'undefined' ? { section: 'dashboard' } : parseAdminLocation(window.location.search));
  const [createUserOpen, setCreateUserOpen] = useState(false);

  useEffect(() => {
    void restore();
  }, []);
  useEffect(() => {
    const restoreLocation = () => setLocation(parseAdminLocation(window.location.search));
    window.addEventListener('popstate', restoreLocation);
    return () => window.removeEventListener('popstate', restoreLocation);
  }, []);
  function navigate(section: AdminSection, values: Omit<AdminLocation, 'section'> = {}) {
    const next = { section, ...values } as AdminLocation;
    window.history.pushState({}, '', buildAdminLocation(section, values));
    setLocation(next);
  }
  const section = location.section;
  const setSection = navigate;

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

  async function restore() {
    try {
      const current = await api<User>('/api/session/me');
      setMe(current);
      await loadUsers();
    } catch {
      setMe(null);
    }
  }
  async function loadUsers() {
    const list = await api<User[]>('/api/backend/users');
    setUsers(list);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: User }>('/api/session/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      });
      setMe(result.user);
      setPassword('');
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await api('/api/session/logout', { method: 'POST' });
    setMe(null);
    setUsers([]);
  }
  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/backend/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setNewUser(emptyUser);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: User) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/backend/users/${user.id}/${user.active ? 'deactivate' : 'activate'}`, { method: 'PATCH' });
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function openHelpSettings(helperId: string) {
    setBusy(true); setError('');
    try {
      const data = await api<{ targets: User[] }>(`/api/backend/users/${helperId}/help-targets`);
      setHelpEditorId(helperId);
      setHelpTargetIds(data.targets.map((item) => item.id));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function saveHelpSettings() {
    if (!helpEditorId) return;
    setBusy(true); setError('');
    try {
      await api(`/api/backend/users/${helpEditorId}/help-targets`, {
        method: 'PATCH', body: JSON.stringify({ targetIds: helpTargetIds }),
      });
      window.alert('Yardım yetkileri kaydedildi.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function resetPassword(user: User) {
    const next = window.prompt(`${user.name} için yeni şifre (en az 8 karakter):`);
    if (!next) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/backend/users/${user.id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password: next }),
      });
      window.alert('Şifre güncellendi. Kullanıcının eski oturumları kapatıldı.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <main className="loginPage">
        <form className="loginCard" onSubmit={signIn}>
          <div className="brand">OPERASYON MERKEZİ</div>
          <h1>Genel Bakış</h1>
          <p className="pageLead">Saha operasyonlarını tek ekrandan yönet.</p>
          <p>Yönetici hesabınla giriş yap.</p>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Kullanıcı adı" autoComplete="username" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Şifre" autoComplete="current-password" required />
          {error ? <div className="error">{error}</div> : null}
          <button disabled={busy} type="submit">{busy ? 'GİRİŞ YAPILIYOR...' : 'GİRİŞ YAP'}</button>
        </form>
      </main>
    );
  }

  return (
    <AdminShell me={me} location={location} onNavigate={navigate} onLogout={() => void signOut()}>

      {error ? <div className="error banner">{error}</div> : null}

      {section === 'dashboard' ? <>
        <div className="sectionEyebrow">KULLANICI ÖZETİ</div>
        <section className="stats">
          <button className="stat statButton" onClick={() => setSection('users')}><strong>{users.length}</strong><span>Toplam kullanıcı</span></button>
          <button className="stat statButton" onClick={() => setSection('users')}><strong>{users.filter((u) => u.role === 'TECHNICIAN' && u.active).length}</strong><span>Aktif teknisyen</span></button>
          <button className="stat statButton" onClick={() => setSection('users')}><strong>{users.filter((u) => !u.active).length}</strong><span>Pasif kullanıcı</span></button>
        </section>
      </> : null}
      {section === 'points' ? <PointList location={location} onNavigate={navigate} /> : section === 'bulk-operations' ? <BulkOperations /> : section === 'location-matching' ? <LocationMatching /> : section === 'ai-dashboard' ? <AiDashboard /> : section === 'anomalies' ? <AnomalyReview /> : section === 'maintenance-calendar' ? <MaintenanceCalendar /> : section === 'prospects' ? <Prospects /> : section === 'audit-log' ? <AuditLog /> : section === 'point-detail' ? <PointDetailPage location={location} onNavigate={navigate} /> : section === 'assignments' ? <AssignmentManagement /> : section === 'paperwork' ? <PaperworkManagement /> : section === 'point-timeline' ? <PointTimeline /> : section === 'duplicates' ? <DuplicateSuggestions /> : section === 'non-maintenance-visits' ? <NonMaintenanceVisits /> : section === 'sap-sync' ? <SapSyncStatus /> : section === 'kpi-reporting' ? <KpiReportingPanel technicians={users.filter((user) => user.role === 'TECHNICIAN' && user.active)} /> : section === 'technician-daily-summary' ? <TechnicianDailySummaryPanel users={users} /> : section === 'dashboard' || section === 'approvals' || section === 'setup-pending' || section === 'regions' ? <Operations users={users} activeSection={section} onNavigate={navigate} /> : null}
      {section === 'users' || section === 'help-targets' ? <section className="panel" id="users">
        <div className="panelHeader">
          <div><h2>Kullanıcılar</h2><p>Teknisyen ve yönetici hesaplarını buradan yönet.</p></div>
          <div className="rowActions"><button className="ghost" onClick={() => void loadUsers()} disabled={busy}>Yenile</button><button onClick={() => setCreateUserOpen(true)}>Yeni Kullanıcı</button></div>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Ad</th><th>Kullanıcı adı</th><th>Rol</th><th>Durum</th><th>Son giriş</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.name}</strong></td>
                  <td>{user.username}</td>
                  <td>{user.role === 'ADMIN' ? 'Yönetici' : 'Teknisyen'}</td>
                  <td><span className={user.active ? 'pill active' : 'pill'}>{user.active ? 'Aktif' : 'Pasif'}</span></td>
                  <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('tr-TR') : '—'}</td>
                  <td className="actions">
                    <button className="small" onClick={() => void resetPassword(user)} disabled={busy}>Şifre</button>
                    {user.role === 'TECHNICIAN' ? <button className="small" onClick={() => void openHelpSettings(user.id)} disabled={busy}>Yardım</button> : null}
                    <button className="small" onClick={() => void toggleActive(user)} disabled={busy || user.id === me.id}>{user.active ? 'Pasifleştir' : 'Aktifleştir'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section> : null}
      {section === 'users' || section === 'help-targets' ? helpEditorId ? <section className="panel">
        <div className="panelHeader"><div><h2>Detaylı kullanıcı ayarları</h2><p>{users.find((u) => u.id === helpEditorId)?.name} kimlere yardım edebilir?</p></div><button className="ghost" onClick={() => setHelpEditorId('')}>Kapat</button></div>
        <div className="helpGrid">
          {users.filter((u) => u.role === 'TECHNICIAN' && u.active && u.id !== helpEditorId).map((target) => (
            <label className="helpOption" key={target.id}>
              <input type="checkbox" checked={helpTargetIds.includes(target.id)} onChange={(e) => setHelpTargetIds(e.target.checked ? [...helpTargetIds, target.id] : helpTargetIds.filter((id) => id !== target.id))} />
              <span><strong>{target.name}</strong><small>@{target.username}</small></span>
            </label>
          ))}
        </div>
        <button onClick={() => void saveHelpSettings()} disabled={busy}>YARDIM YETKİLERİNİ KAYDET</button>
      </section> : section === 'help-targets' ? <section className="panel"><div className="emptyState compact"><strong>Teknisyen seçin</strong><span>Yardım yetkilerini düzenlemek için kullanıcı satırındaki Yardım aksiyonunu kullanın.</span></div></section> : null : null}

      {(section === 'users' || section === 'help-targets') && createUserOpen ? <section className="panel" id="new-user">
        <div className="panelHeader"><div><h2>Yeni kullanıcı</h2><p>Yeni teknisyen veya yönetici hesabı oluştur.</p></div></div>
        <form className="userForm" onSubmit={createUser}>
          <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Ad soyad" minLength={2} required />
          <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase() })} placeholder="Kullanıcı adı" required />
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as NewUser['role']})}>
            <option value="TECHNICIAN">Teknisyen</option>
            <option value="ADMIN">Yönetici</option>
          </select>
          <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} type="password" placeholder="Geçici şifre (min. 8 karakter)" minLength={8} required />
          <button type="submit" disabled={busy}>KULLANICI OLUŞTUR</button>
        </form>
      </section> : null}
    </AdminShell>
  );
}
