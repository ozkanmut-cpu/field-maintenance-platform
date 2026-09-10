'use client';

import { FormEvent, useEffect, useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'TECHNICIAN';
  active: boolean;
  lastLoginAt?: string | null;
};

type NewUser = {
  name: string;
  email: string;
  role: 'ADMIN' | 'TECHNICIAN';
  password: string;
};

const emptyUser: NewUser = { name: '', email: '', role: 'TECHNICIAN', password: '' };

export default function Home() {
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newUser, setNewUser] = useState<NewUser>(emptyUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
        body: JSON.stringify({ email, password }),
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
  async function resetPassword(user: User) {
    const next = window.prompt(`${user.name} için yeni şifre (en az 12 karakter):`);
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
          <div className="brand">FIELD MAINTENANCE</div>
          <h1>Yönetim Paneli</h1>
          <p>Yönetici hesabınla giriş yap.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-posta" autoComplete="email" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Şifre" autoComplete="current-password" required />
          {error ? <div className="error">{error}</div> : null}
          <button disabled={busy} type="submit">{busy ? 'GİRİŞ YAPILIYOR...' : 'GİRİŞ YAP'}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">FIELD MAINTENANCE</div>
          <h1>Yönetim Paneli</h1>
        </div>
        <div className="account">
          <span>{me.name}</span>
          <button className="ghost" onClick={() => void signOut()}>Çıkış</button>
        </div>
      </header>

      {error ? <div className="error banner">{error}</div> : null}

      <section className="stats">
        <div className="stat"><strong>{users.length}</strong><span>Toplam kullanıcı</span></div>
        <div className="stat"><strong>{users.filter((u) => u.role === 'TECHNICIAN' && u.active).length}</strong><span>Aktif teknisyen</span></div>
        <div className="stat"><strong>{users.filter((u) => !u.active).length}</strong><span>Pasif kullanıcı</span></div>
      </section>
      <section className="panel">
        <div className="panelHeader">
          <div><h2>Kullanıcılar</h2><p>Teknisyen ve yönetici hesaplarını buradan yönet.</p></div>
          <button className="ghost" onClick={() => void loadUsers()} disabled={busy}>Yenile</button>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>Son giriş</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.name}</strong></td>
                  <td>{user.email}</td>
                  <td>{user.role === 'ADMIN' ? 'Yönetici' : 'Teknisyen'}</td>
                  <td><span className={user.active ? 'pill active' : 'pill'}>{user.active ? 'Aktif' : 'Pasif'}</span></td>
                  <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('tr-TR') : '—'}</td>
                  <td className="actions">
                    <button className="small" onClick={() => void resetPassword(user)} disabled={busy}>Şifre</button>
                    <button className="small" onClick={() => void toggleActive(user)} disabled={busy || user.id === me.id}>{user.active ? 'Pasifleştir' : 'Aktifleştir'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panelHeader"><div><h2>Yeni kullanıcı</h2><p>Yeni teknisyen veya yönetici hesabı oluştur.</p></div></div>
        <form className="userForm" onSubmit={createUser}>
          <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="Ad soyad" minLength={2} required />
          <input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} type="email" placeholder="E-posta" required />
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as NewUser['role'] })}>
            <option value="TECHNICIAN">Teknisyen</option>
            <option value="ADMIN">Yönetici</option>
          </select>
          <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} type="password" placeholder="Geçici şifre (min. 12 karakter)" minLength={12} required />
          <button type="submit" disabled={busy}>KULLANICI OLUŞTUR</button>
        </form>
      </section>
    </main>
  );
}
