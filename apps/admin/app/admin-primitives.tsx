'use client';

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
