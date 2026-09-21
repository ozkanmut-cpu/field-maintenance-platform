'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AdminIcon } from './admin-icons';
import { type AdminLocation, type AdminSection, getNavigationItem, navigationItems } from './admin-navigation';

type User = { id: string; name: string; username: string; role: 'ADMIN' | 'TECHNICIAN' };
type Props = { me: User; location: AdminLocation; onNavigate: (section: AdminSection, values?: Omit<AdminLocation, 'section'>) => void; onLogout: () => void; children: ReactNode };

function tableName(table: HTMLTableElement) {
  const heading = table.closest('.panel, section')?.querySelector('h1, h2, h3')?.textContent?.trim();
  const firstColumn = table.querySelector('thead th')?.textContent?.trim();
  const identity = [heading, firstColumn].filter(Boolean).join(': ');
  return identity ? `${identity} tablosu` : 'Yönetim veri tablosu';
}

function enhanceTables() {
  document.querySelectorAll<HTMLTableElement>('.tableWrap table').forEach((table) => {
    const label = tableName(table);
    if (!table.caption) {
      const caption = document.createElement('caption');
      caption.className = 'srOnly';
      caption.textContent = label;
      table.prepend(caption);
    }
    if (!table.hasAttribute('aria-label') && !table.hasAttribute('aria-labelledby')) table.setAttribute('aria-label', label);
    const wrapper = table.closest<HTMLElement>('.tableWrap');
    if (!wrapper) return;
    if (!wrapper.hasAttribute('tabindex')) wrapper.tabIndex = 0;
    if (!wrapper.hasAttribute('role')) wrapper.setAttribute('role', 'region');
    if (!wrapper.hasAttribute('aria-label')) wrapper.setAttribute('aria-label', `${label}. Yatay kaydırmak için ok tuşlarını kullanın.`);
  });
}

export default function AdminShell({ me, location, onNavigate, onLogout, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const active = getNavigationItem(location.section);
  const groups = useMemo(() => Array.from(new Set(navigationItems.map((item) => item.group))), []);
  const [openGroups, setOpenGroups] = useState<string[]>(groups);
  const sidebarIsCollapsed = collapsed && !isCompact;

  useEffect(() => { setOpenGroups((current) => current.includes(active.group) ? current : [...current, active.group]); }, [active.group]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)');
    const update = () => { setIsCompact(media.matches); if (!media.matches) setIsDrawerOpen(false); };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    enhanceTables();
    const observer = new MutationObserver(enhanceTables);
    observer.observe(document.body, { childList: true, subtree: true });
    const controller = new AbortController();
    const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    document.addEventListener('keydown', (event) => {
      const wrapper = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.tableWrap') : null;
      if (!wrapper || event.target !== wrapper) return;
      if (event.key === 'ArrowLeft') { wrapper.scrollBy({ left: -80, behavior: scrollBehavior }); event.preventDefault(); }
      if (event.key === 'ArrowRight') { wrapper.scrollBy({ left: 80, behavior: scrollBehavior }); event.preventDefault(); }
      if (event.key === 'Home') { wrapper.scrollTo({ left: 0, behavior: scrollBehavior }); event.preventDefault(); }
      if (event.key === 'End') { wrapper.scrollTo({ left: wrapper.scrollWidth, behavior: scrollBehavior }); event.preventDefault(); }
    }, { signal: controller.signal });
    return () => { observer.disconnect(); controller.abort(); };
  }, []);
  useEffect(() => {
    if (!isDrawerOpen) return;
    drawerRef.current?.querySelector<HTMLButtonElement>('.sideGroupButton')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not(.collapseControl)'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [isDrawerOpen]);

  function closeDrawer() {
    setIsDrawerOpen(false);
    window.requestAnimationFrame(() => menuToggleRef.current?.focus());
  }
  function toggleCollapsed() {
    setCollapsed((current) => !current);
  }
  function navigate(section: AdminSection) {
    onNavigate(section);
    if (isCompact) closeDrawer();
  }

  return <main className={`adminLayout ${sidebarIsCollapsed ? 'sidebarCollapsed' : ''} ${isDrawerOpen ? 'sidebarDrawerOpen' : ''}`}>
    {isCompact ? <button className="drawerBackdrop" aria-label="Menüyü kapat" onClick={closeDrawer} /> : null}
    <aside id="admin-navigation-drawer" ref={drawerRef} className="sidebar" aria-label="Yönetim menüsü" role={isCompact && isDrawerOpen ? 'dialog' : undefined} aria-modal={isCompact && isDrawerOpen ? true : undefined} aria-hidden={isCompact && !isDrawerOpen ? true : undefined}>
      <div className="sidebarBrand"><span className="brandMark">F</span><div><strong>Fıçıbakım</strong><small>Saha bakım yönetimi</small></div></div>
      <nav className="sideNav" aria-label="Yönetim bölümleri">
        {groups.map((group) => {
          const items = navigationItems.filter((item) => item.group === group);
          const expanded = openGroups.includes(group);
          const groupActive = items.some((item) => item.section === location.section);
          return <div className="sideNavGroup" key={group}>
            <button className={`sideGroupButton ${groupActive ? 'activeParent' : ''}`} aria-expanded={expanded} title={sidebarIsCollapsed ? group : undefined} onClick={() => setOpenGroups((current) => expanded ? current.filter((item) => item !== group) : [...current, group])}>
              <AdminIcon name={items[0].icon} /><span>{group}</span><span className="sideChevron" aria-hidden="true">⌄</span>
            </button>
            {expanded ? <div className="sideChildren">
              {items.map((item) => <button key={item.section} className={item.section === location.section ? 'active' : ''} aria-current={item.section === location.section ? 'page' : undefined} title={sidebarIsCollapsed ? item.label : undefined} onClick={() => navigate(item.section)}>
                <AdminIcon name={item.icon} /><span>{item.label}</span>
              </button>)}
            </div> : null}
          </div>;
        })}
      </nav>
      <button className="collapseControl" onClick={toggleCollapsed} title={sidebarIsCollapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'} aria-label={sidebarIsCollapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'}><span aria-hidden="true">«</span><span>Menüyü Daralt</span></button>
    </aside>
    <div className="adminMain" inert={isCompact && isDrawerOpen ? true : undefined}>
      <header className="topbar">
        <div className="pageHeading"><button ref={menuToggleRef} className="menuToggle" aria-controls="admin-navigation-drawer" aria-expanded={isDrawerOpen} aria-label={isDrawerOpen ? 'Menüyü Kapat' : 'Menüyü Aç'} onClick={() => setIsDrawerOpen((current) => !current)}><AdminIcon name="dashboard" size={17} /><span>{isDrawerOpen ? 'Menüyü Kapat' : 'Menüyü Aç'}</span></button><div><div className="breadcrumb">{active.group} <span>/</span> {active.label}</div><h1>{active.label}</h1></div></div>
        <div className="account"><span className="accountInitial">{me.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{me.name}</strong><small>ADMIN</small></span><button className="ghost" onClick={onLogout}><AdminIcon name="logout" size={16} /><span>Çıkış</span></button></div>
      </header>
      {children}
    </div>
  </main>;
}
