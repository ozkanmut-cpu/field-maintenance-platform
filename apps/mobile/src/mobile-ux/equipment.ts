export type EquipmentCounts = {
  coolerCount: number;
  towerCount: number;
  tapCount: number;
  smarttapCount: number;
};

export type EquipmentInput = Record<keyof EquipmentCounts, string>;

export type EquipmentProfile = Partial<Record<keyof EquipmentCounts, number | null>>;

export const equipmentFields: Array<{ key: keyof EquipmentCounts; label: string }> = [
  { key: 'coolerCount', label: 'Soğutucu' },
  { key: 'towerCount', label: 'Kule' },
  { key: 'tapCount', label: 'Musluk' },
  { key: 'smarttapCount', label: 'SmartTap' },
];

export function equipmentInputFrom(profile: EquipmentProfile): EquipmentInput {
  return Object.fromEntries(equipmentFields.map(({ key }) => [key, profile[key] == null ? '' : String(profile[key])])) as EquipmentInput;
}

export function parseEquipment(input: EquipmentInput): { values: EquipmentCounts } | { error: string } {
  const values = {} as EquipmentCounts;
  for (const { key } of equipmentFields) {
    const raw = input[key].trim();
    if (!/^\d+$/.test(raw)) return { error: 'Tüm ekipman adetlerini 0 veya daha büyük tam sayı olarak gir.' };
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) return { error: 'Tüm ekipman adetlerini 0 veya daha büyük tam sayı olarak gir.' };
    values[key] = value;
  }
  return { values };
}

export function equipmentInputChangesIntent(current: EquipmentInput, next: EquipmentInput) {
  const currentParsed = parseEquipment(current);
  const nextParsed = parseEquipment(next);
  if ('values' in currentParsed && 'values' in nextParsed) {
    return equipmentFields.some(({ key }) => currentParsed.values[key] !== nextParsed.values[key]);
  }
  return equipmentFields.some(({ key }) => current[key].trim() !== next[key].trim());
}

export function equipmentDiff(original: EquipmentProfile, updated: EquipmentCounts) {
  return equipmentFields.flatMap(({ key, label }) => original[key] === updated[key]
    ? []
    : [{ key, label, before: original[key] ?? null, after: updated[key] }]);
}
