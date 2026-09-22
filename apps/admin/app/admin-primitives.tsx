'use client';

import type { ReactNode } from 'react';
import type { AdminSection } from './admin-navigation';

type MetricCardProps = {
  label: string;
  value: number | string;
  description: string;
  section: AdminSection;
  onNavigate: (section: AdminSection) => void;
};

export function MetricCard({ label, value, description, section, onNavigate }: MetricCardProps) {
  return <button type="button" className="metricCard metricCardButton" onClick={() => onNavigate(section)} aria-label={`${label}: ${value}. ${description}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{description}</small>
  </button>;
}

export type ActiveFilter = {
  id: string;
  label: string;
  onRemove?: () => void;
};

type AdminFilterToolbarProps = {
  children: ReactNode;
  activeFilters?: ActiveFilter[];
  resultCount: number;
  resultLabel?: string;
  lastUpdated?: string;
  refreshing?: boolean;
  onClear?: () => void;
  onRefresh?: () => void;
};

export function FilterChip({ label, onRemove }: Omit<ActiveFilter, 'id'>) {
  if (!onRemove) return <span className="filterChip">{label}</span>;
  return <button type="button" className="filterChip filterChipButton" onClick={onRemove} aria-label={`${label} filtresini kaldır`}>
    <span>{label}</span><span aria-hidden="true">×</span>
  </button>;
}

export function AdminFilterToolbar({ children, activeFilters = [], resultCount, resultLabel = 'kayıt', lastUpdated, refreshing = false, onClear, onRefresh }: AdminFilterToolbarProps) {
  return <section className="adminFilterToolbar" aria-label="Liste filtreleri">
    <div className="adminFilterControls">{children}</div>
    <div className="adminFilterMeta" aria-live="polite">
      <strong>{resultCount} {resultLabel}</strong>
      {lastUpdated ? <span>Son güncelleme: {lastUpdated}</span> : <span />}
      {onRefresh ? <button type="button" className="small" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Yenileniyor…' : 'Yenile'}</button> : <span />}
    </div>
    {activeFilters.length ? <div className="activeFilterRow">
      {onClear ? <button type="button" className="clearFilters" onClick={onClear}>Filtreleri temizle</button> : <span />}
      <div className="filterChips" role="list" aria-label="Aktif filtreler">
        {activeFilters.map((filter) => <span role="listitem" key={filter.id}><FilterChip label={filter.label} onRemove={filter.onRemove} /></span>)}
      </div>
    </div> : null}
  </section>;
}

export type AdminListStateKind = 'loading' | 'empty' | 'error' | 'success';

type AdminListStateProps = {
  state: AdminListStateKind;
  title: string;
  description?: string;
  onRetry?: () => void;
};

export function AdminListState({ state, title, description, onRetry }: AdminListStateProps) {
  const isError = state === 'error';
  return <div className={`adminListState ${state}`} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'} aria-busy={state === 'loading'}>
    <strong>{title}</strong>
    {description ? <span>{description}</span> : <span />}
    {onRetry ? <button type="button" className="small" onClick={onRetry}>Yeniden dene</button> : <span />}
  </div>;
}

type AdminPanelProps = {
  title: string;
  titleId: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AdminPanel({ title, titleId, description, actions, children, className = '' }: AdminPanelProps) {
  return <section className={`panel adminPanel ${className}`.trim()} aria-labelledby={titleId}>
    <header className="panelHeader">
      <div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="actions">{actions}</div> : null}
    </header>
    {children}
  </section>;
}
