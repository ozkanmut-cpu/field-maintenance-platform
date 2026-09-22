export type PaperworkStatusValue = 'PENDING' | 'PRESENT' | 'MISSING' | 'PENDING_REVIEW' | 'APPROVED';
export type PaperworkKindValue = 'SERVICE_SLIP' | 'CONFIRMATION';

export function paperworkStatusOptions(
  kind: PaperworkKindValue,
  currentStatus?: PaperworkStatusValue,
): Array<{ value: PaperworkStatusValue; label: string; disabled: boolean }>;

export function bulkPaperworkStatusOptions(
  kind: PaperworkKindValue,
  currentStatuses?: PaperworkStatusValue[],
): Array<{ value: PaperworkStatusValue; label: string; disabled: boolean }>;
