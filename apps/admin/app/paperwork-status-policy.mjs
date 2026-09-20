const labels = {
  PENDING: 'Bekliyor',
  PRESENT: 'Var',
  MISSING: 'Eksik',
  PENDING_REVIEW: 'İnceleme bekliyor',
  APPROVED: 'Onaylandı',
};

const finalStatuses = ['PENDING', 'PRESENT', 'MISSING', 'APPROVED'];

export function paperworkStatusOptions(kind, currentStatus) {
  const statuses = kind === 'SERVICE_SLIP' && currentStatus === 'PENDING_REVIEW'
    ? ['PENDING_REVIEW', 'MISSING', 'APPROVED']
    : finalStatuses;
  return statuses.map((value) => ({
    value,
    label: labels[value],
    disabled: value === 'PENDING_REVIEW',
  }));
}

export function bulkPaperworkStatusOptions(kind, currentStatuses = []) {
  if (kind === 'SERVICE_SLIP' && currentStatuses.includes('PENDING_REVIEW')) {
    return paperworkStatusOptions(kind, 'PENDING_REVIEW').filter((option) => !option.disabled);
  }
  return paperworkStatusOptions(kind).filter((option) => !option.disabled);
}
