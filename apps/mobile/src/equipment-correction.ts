export type EquipmentCounts = {
  coolerCount: number;
  towerCount: number;
  tapCount: number;
  smarttapCount: number;
};

export type StoredEquipmentCounts = {
  [Field in keyof EquipmentCounts]?: number | null;
};

const equipmentFields: ReadonlyArray<keyof EquipmentCounts> = [
  'coolerCount',
  'towerCount',
  'tapCount',
  'smarttapCount',
];

export function requiresEquipmentCorrection(
  stored: StoredEquipmentCounts,
  submitted: EquipmentCounts,
): boolean {
  return equipmentFields.some((field) => stored[field] != null && stored[field] !== submitted[field]);
}

export function equipmentCorrectionPayload(
  stored: StoredEquipmentCounts,
  submitted: EquipmentCounts,
  approved: boolean,
): { equipmentCorrectionRequested?: true } {
  const correctionNeeded = requiresEquipmentCorrection(stored, submitted);
  if (correctionNeeded && !approved) {
    throw new Error('Ekipman sayısı değişikliğini ayrıca onayla.');
  }
  return correctionNeeded ? { equipmentCorrectionRequested: true } : {};
}
