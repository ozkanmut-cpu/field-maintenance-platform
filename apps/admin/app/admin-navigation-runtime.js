const sections = new Set([
  'dashboard', 'maintenance-calendar', 'assignments', 'non-maintenance-visits', 'paperwork', 'approvals', 'anomalies', 'points', 'point-detail', 'bulk-operations', 'setup-pending', 'regions', 'location-matching', 'duplicates', 'point-timeline', 'prospects', 'kpi-reporting', 'technician-daily-summary', 'ai-dashboard', 'sap-sync', 'users', 'help-targets', 'audit-log',
]);

export function parseAdminLocation(search) {
  const params = new URLSearchParams(search);
  const candidate = params.get('section');
  const value = { section: candidate && sections.has(candidate) ? candidate : 'dashboard' };
  for (const [parameter, property] of [['pointId', 'pointId'], ['tab', 'detailTab'], ['query', 'query'], ['status', 'status'], ['region', 'region'], ['maintenanceType', 'maintenanceType'], ['page', 'page'], ['scrollY', 'scrollY'], ['userId', 'userId']]) {
    const item = params.get(parameter);
    if (item) value[property] = item;
  }
  if (params.get('createUser') === '1') value.createUser = true;
  return value;
}

export function buildAdminLocation(section, values = {}) {
  const params = new URLSearchParams({ section });
  for (const [property, parameter] of [['pointId', 'pointId'], ['detailTab', 'tab'], ['query', 'query'], ['status', 'status'], ['region', 'region'], ['maintenanceType', 'maintenanceType'], ['page', 'page'], ['scrollY', 'scrollY'], ['userId', 'userId']]) {
    if (values[property]) params.set(parameter, values[property]);
  }
  if (values.createUser) params.set('createUser', '1');
  return `?${params.toString()}`;
}

export function pointListValues({ query = '', status = 'ALL', region = 'ALL', maintenanceType = 'ALL', page = 1, scrollY = 0 }) {
  return {
    ...(query ? { query } : {}),
    ...(status !== 'ALL' ? { status } : {}),
    ...(region !== 'ALL' ? { region } : {}),
    ...(maintenanceType !== 'ALL' ? { maintenanceType } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
    ...(scrollY > 0 ? { scrollY: String(scrollY) } : {}),
  };
}

export function pointListScrollKey(values) {
  const { scrollY: _scrollY, ...context } = values;
  return `admin:point-list-scroll:${buildAdminLocation('points', context)}`;
}
