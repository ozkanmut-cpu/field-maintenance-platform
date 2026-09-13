'use client';

import { FormEvent, useEffect, useState } from 'react';
import Operations from './operations';
import LocationMatching from './location-matching';
import AiDashboard from './ai-dashboard';
import AnomalyReview from './anomaly-review';
import MaintenanceCalendar from './maintenance-calendar';
import Prospects from './prospects';
import AuditLog from './audit-log';
import PointDetails from './point-details';
import AssignmentManagement from './assignment-management';
import PaperworkManagement from './paperwork-management';
import PointTimeline from './point-timeline';
import DuplicateSuggestions from './duplicate-suggestions';
import { AdminIcon } from './admin-icons';
import NonMaintenanceVisits from './non-maintenance-visits';

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
  const [section, setSection] = useState<'dashboard' | 'approvals' | 'setup-pending' | 'regions' | 'points' | 'location-matching' | 'ai-dashboard' | 'anomalies' | 'maintenance-calendar' | 'prospects' | 'audit-log' | 'point-details' | 'assignments' | 'paperwork' | 'point-timeline' | 'duplicates' | 'non-maintenance-visits' | 'users' | 'new-user'>('dashboard');

  useEffect(() => {
    void restore();
  }, []);

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
    <main className="adminLayout">
      <aside className="sidebar">
        <div className="sidebarBrand"><span className="brandMark">S</span><div><strong>SAHA BAKIM</strong><small>Yönetim Sistemi</small></div></div>
        <nav className="sideNav">
          <button className={section === 'dashboard' ? 'active' : ''} aria-current={section === 'dashboard' ? 'page' : undefined} aria-label="Dashboard" title="Dashboard" onClick={() => setSection('dashboard')}><AdminIcon name="dashboard" /><span>Dashboard</span></button>
          <button className={section === 'approvals' ? 'active' : ''} aria-current={section === 'approvals' ? 'page' : undefined} aria-label="Onaylar" title="Onaylar" onClick={() => setSection('approvals')}><AdminIcon name="approval" /><span>Onaylar</span></button>
          <button className={section === 'setup-pending' ? 'active' : ''} aria-current={section === 'setup-pending' ? 'page' : undefined} aria-label="Ayar Bekleyenler" title="Ayar Bekleyenler" onClick={() => setSection('setup-pending')}><AdminIcon name="settings" /><span>Ayar Bekleyenler</span></button>
          <button className={section === 'regions' ? 'active' : ''} aria-current={section === 'regions' ? 'page' : undefined} aria-label="Bölgeler" title="Bölgeler" onClick={() => setSection('regions')}><AdminIcon name="regions" /><span>Bölgeler</span></button>
          <button className={section === 'points' ? 'active' : ''} aria-current={section === 'points' ? 'page' : undefined} aria-label="Noktalar" title="Noktalar" onClick={() => setSection('points')}><AdminIcon name="points" /><span>Noktalar</span></button>
          <button className={section === 'location-matching' ? 'active' : ''} aria-current={section === 'location-matching' ? 'page' : undefined} aria-label="SAP / Google" title="SAP / Google" onClick={() => setSection('location-matching')}><AdminIcon name="map" /><span>SAP / Google</span></button>
          <button className={section === 'ai-dashboard' ? 'active' : ''} aria-current={section === 'ai-dashboard' ? 'page' : undefined} aria-label="Sanal İstatistikçi" title="Sanal İstatistikçi" onClick={() => setSection('ai-dashboard')}><AdminIcon name="analytics" /><span>Sanal İstatistikçi</span></button>
          <button className={section === 'anomalies' ? 'active' : ''} aria-current={section === 'anomalies' ? 'page' : undefined} aria-label="Anomaliler" title="Anomaliler" onClick={() => setSection('anomalies')}><AdminIcon name="warning" /><span>Anomaliler</span></button>
          <button className={section === 'maintenance-calendar' ? 'active' : ''} aria-current={section === 'maintenance-calendar' ? 'page' : undefined} aria-label="Bakım Takvimi" title="Bakım Takvimi" onClick={() => setSection('maintenance-calendar')}><AdminIcon name="calendar" /><span>Bakım Takvimi</span></button>
          <button className={section === 'prospects' ? 'active' : ''} aria-current={section === 'prospects' ? 'page' : undefined} aria-label="Potansiyel Müşteriler" title="Potansiyel Müşteriler" onClick={() => setSection('prospects')}><AdminIcon name="prospects" /><span>Potansiyel Müşteriler</span></button>
          <button className={section === 'audit-log' ? 'active' : ''} aria-current={section === 'audit-log' ? 'page' : undefined} aria-label="İşlem Geçmişi" title="İşlem Geçmişi" onClick={() => setSection('audit-log')}><AdminIcon name="history" /><span>İşlem Geçmişi</span></button>
          <button className={section === 'point-details' ? 'active' : ''} aria-current={section === 'point-details' ? 'page' : undefined} aria-label="Nokta Detayı" title="Nokta Detayı" onClick={() => setSection('point-details')}><AdminIcon name="detail" /><span>Nokta Detayı</span></button>
          <button className={section === 'assignments' ? 'active' : ''} aria-current={section === 'assignments' ? 'page' : undefined} aria-label="Görevlendirmeler" title="Görevlendirmeler" onClick={() => setSection('assignments')}><AdminIcon name="assignment" /><span>Görevlendirmeler</span></button>
          <button className={section === 'paperwork' ? 'active' : ''} aria-current={section === 'paperwork' ? 'page' : undefined} aria-label="Evrak Yönetimi" title="Evrak Yönetimi" onClick={() => setSection('paperwork')}><AdminIcon name="documents" /><span>Evrak Yönetimi</span></button>
          <button className={section === 'point-timeline' ? 'active' : ''} aria-current={section === 'point-timeline' ? 'page' : undefined} aria-label="Nokta Timeline" title="Nokta Timeline" onClick={() => setSection('point-timeline')}><AdminIcon name="timeline" /><span>Nokta Timeline</span></button>
          <button className={section === 'duplicates' ? 'active' : ''} aria-current={section === 'duplicates' ? 'page' : undefined} aria-label="Mükerrer Noktalar" title="Mükerrer Noktalar" onClick={() => setSection('duplicates')}><AdminIcon name="duplicate" /><span>Mükerrer Noktalar</span></button>
          <button className={section === 'non-maintenance-visits' ? 'active' : ''} aria-current={section === 'non-maintenance-visits' ? 'page' : undefined} aria-label="Bakım Dışı Ziyaretler" title="Bakım Dışı Ziyaretler" onClick={() => setSection('non-maintenance-visits')}><AdminIcon name="visit" /><span>Bakım Dışı Ziyaretler</span></button>
          <button className={section === 'users' ? 'active' : ''} aria-current={section === 'users' ? 'page' : undefined} aria-label="Teknisyenler" title="Teknisyenler" onClick={() => setSection('users')}><AdminIcon name="users" /><span>Teknisyenler</span></button>
          <button className={section === 'new-user' ? 'active' : ''} aria-current={section === 'new-user' ? 'page' : undefined} aria-label="Yeni Kullanıcı" title="Yeni Kullanıcı" onClick={() => setSection('new-user')}><AdminIcon name="addUser" /><span>Yeni Kullanıcı</span></button>
        </nav>
        <div className="sidebarFoot"><span className="statusDot" /> Sistem aktif</div>
      </aside>
      <div className="adminMain">
      <header className="topbar" id="dashboard">
        <div>
          <div className="brand">FIELD MAINTENANCE</div>
          <h1>{section === 'dashboard' ? 'Dashboard' : section === 'approvals' ? 'Onaylar' : section === 'setup-pending' ? 'Ayar Bekleyen Noktalar' : section === 'regions' ? 'Bölgeler' : section === 'points' ? 'Noktalar' : section === 'location-matching' ? 'SAP / Google Eşleştirme' : section === 'ai-dashboard' ? 'Sanal İstatistikçi' : section === 'anomalies' ? 'Bakım Anomalileri' : section === 'maintenance-calendar' ? 'Bakım Takvimi' : section === 'prospects' ? 'Potansiyel Müşteriler' : section === 'audit-log' ? 'İşlem Geçmişi' : section === 'point-details' ? 'Nokta Detayı' : section === 'assignments' ? 'Görevlendirmeler' : section === 'paperwork' ? 'Evrak Yönetimi' : section === 'point-timeline' ? 'Nokta Timeline' : section === 'duplicates' ? 'Mükerrer Noktalar' : section === 'non-maintenance-visits' ? 'Bakım Dışı Ziyaretler' : section === 'users' ? 'Teknisyenler' : 'Yeni Kullanıcı'}</h1>
        </div>
        <div className="account">
          <span>{me.name}</span>
          <button className="ghost iconAction" onClick={() => void signOut()}><AdminIcon name="logout" size={17} /><span>Çıkış</span></button>
        </div>
      </header>

      {error ? <div className="error banner">{error}</div> : null}

      {section === 'dashboard' ? <>
        <div className="sectionEyebrow">KULLANICI ÖZETİ</div>
        <section className="stats">
          <button className="stat statButton" onClick={() => setSection('users')}><strong>{users.length}</strong><span>Toplam kullanıcı</span></button>
          <button className="stat statButton" onClick={() => setSection('users')}><strong>{users.filter((u) => u.role === 'TECHNICIAN' && u.active).length}</strong><span>Aktif teknisyen</span></button>
          <button className="stat statButton" onClick={() => setSection('users')}><strong>{users.filter((u) => !u.active).length}</strong><span>Pasif kullanıcı</span></button>
        </section>
      </> : null}
      {section === 'location-matching' ? <LocationMatching /> : section === 'ai-dashboard' ? <AiDashboard /> : section === 'anomalies' ? <AnomalyReview /> : section === 'maintenance-calendar' ? <MaintenanceCalendar /> : section === 'prospects' ? <Prospects /> : section === 'audit-log' ? <AuditLog /> : section === 'point-details' ? <PointDetails /> : section === 'assignments' ? <AssignmentManagement /> : section === 'paperwork' ? <PaperworkManagement /> : section === 'point-timeline' ? <PointTimeline /> : section === 'duplicates' ? <DuplicateSuggestions /> : section === 'non-maintenance-visits' ? <NonMaintenanceVisits /> : <Operations users={users} activeSection={section} onNavigate={setSection} />}
      {section === 'users' ? <section className="panel" id="users">
        <div className="panelHeader">
          <div><h2>Kullanıcılar</h2><p>Teknisyen ve yönetici hesaplarını buradan yönet.</p></div>
          <button className="ghost" onClick={() => void loadUsers()} disabled={busy}>Yenile</button>
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
      {section === 'users' && helpEditorId ? <section className="panel">
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
      </section> : null}

      {section === 'new-user' ? <section className="panel" id="new-user">
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
      </div>
    </main>
  );
}
