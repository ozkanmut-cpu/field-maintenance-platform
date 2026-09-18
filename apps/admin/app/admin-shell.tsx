'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminIcon } from './admin-icons';
import { type AdminLocation, type AdminSection, getNavigationItem, navigationItems } from './admin-navigation';

type User = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN' };
type Props = { me: User; location: AdminLocation; onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void; onLogout: () => void; children: ReactNode };

export default function AdminShell({ me, location, onNavigate, onLogout, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const active = getNavigationItem(location.section);
  const groups = useMemo(() => Array.from(new Set(navigationItems.map((item) => item.group))), []);
  const [openGroups, setOpenGroups] = useState<string[]>([active.group]);

  useEffect(() => { setCollapsed(localStorage.getItem('admin-sidebar-collapsed') === 'true'); }, []);
  useEffect(() => { setOpenGroups((current) => current.includes(active.group) ? current : [...current, active.group]); }, [active.group]);
  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem('admin-sidebar-collapsed', String(next));
      return next;
    });
  }

  return <main className={`adminLayout ${collapsed ? 'sidebarCollapsed' : ''}`}>
    <aside className="sidebar" aria-label="Yönetim menüsü">
      <div className="sidebarBrand"><span className="brandMark">F</span><div><strong>Fıçıbakım</strong><small>Saha bakım yönetimi</small></div></div>
      <nav className="sideNav">
        {groups.map((group) => {
          const items = navigationItems.filter((item) => item.group === group);
          const expanded = openGroups.includes(group);
          const groupActive = items.some((item) => item.section === location.section);
          return <div className="sideNavGroup" key={group}>
            <button className={`sideGroupButton ${groupActive ? 'activeParent' : ''}`} aria-expanded={expanded} title={collapsed ? group : undefined} onClick={() => setOpenGroups((current) => expanded ? current.filter((item) => item !== group) : [...current, group])}>
              <AdminIcon name={items[0].icon} /><span>{group}</span><span className="sideChevron" aria-hidden="true">⌄</span>
            </button>
            {expanded ? <div className="sideChildren">
              {items.map((item) => <button key={item.section} className={item.section === location.section ? 'active' : ''} aria-current={item.section === location.section ? 'page' : undefined} title={collapsed ? item.label : undefined} onClick={() => onNavigate(item.section)}>
                <AdminIcon name={item.icon} /><span>{item.label}</span>
              </button>)}
            </div> : null}
          </div>;
        })}
      </nav>
      <button className="collapseControl" onClick={toggleCollapsed} title={collapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'} aria-label={collapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'}><span aria-hidden="true">«</span><span>Menüyü Daralt</span></button>
    </aside>
    <div className="adminMain">
      <header className="topbar">
        <div><div className="breadcrumb">{active.group} <span>/</span> {active.label}</div><h1>{active.label}</h1></div>
        <div className="account"><span className="accountInitial">{me.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{me.name}</strong><small>ADMIN</small></span><button className="ghost" onClick={onLogout}><AdminIcon name="logout" size={16} /><span>Çıkış</span></button></div>
      </header>
      {children}
    </div>
  </main>;
}
