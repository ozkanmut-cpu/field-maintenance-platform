import type { CalibrationImpact } from './workload-calibration.service';

export type EquipmentWorkloadMix = {
  coolerCount: number | null;
  towerCount: number | null;
  tapCount: number | null;
  smarttapCount: number | null;
};

export type ServiceWorkloadIndex = {
  state: 'WARMING_UP' | 'READY';
  index: number | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  basis: 'LEARNED_EQUIPMENT_OUTCOME_ASSOCIATION';
  dimensionsUsed: number;
  weights: Record<'coolerCount' | 'towerCount' | 'tapCount' | 'smarttapCount', number | null>;
  reasonCodes: string[];
};
const impactCodeToKey = {
  COOLER_RELATIVE_WORKLOAD: 'coolerCount',
  TOWER_RELATIVE_WORKLOAD: 'towerCount',
  TAP_RELATIVE_WORKLOAD: 'tapCount',
  SMARTTAP_RELATIVE_WORKLOAD: 'smarttapCount',
} as const;

export function buildServiceWorkloadIndex(
  current: EquipmentWorkloadMix,
  reference: EquipmentWorkloadMix,
  impacts: CalibrationImpact[],
  modelConfidence: 'LOW' | 'MEDIUM' | 'HIGH',
): ServiceWorkloadIndex {
  const reasonCodes: string[] = [];
  const weights: ServiceWorkloadIndex['weights'] = { coolerCount: null, towerCount: null, tapCount: null, smarttapCount: null };
  if ([...Object.values(current), ...Object.values(reference)].some((value) => value === null)) {
    return { state: 'WARMING_UP', index: null, confidence: 'LOW', basis: 'LEARNED_EQUIPMENT_OUTCOME_ASSOCIATION', dimensionsUsed: 0, weights, reasonCodes: ['EQUIPMENT_MIX_INCOMPLETE'] };
  }
  const usable = impacts.flatMap((impact) => {
    const key = impactCodeToKey[impact.code as keyof typeof impactCodeToKey];
    if (!key || impact.relativeImpact === null || impact.confidence === 'LOW') return [];
    return [{ key, magnitude: Math.abs(impact.relativeImpact), confidence: impact.confidence }];
  }).filter((item) => item.magnitude > 0);

  const totalMagnitude = usable.reduce((sum, item) => sum + item.magnitude, 0);
  if (usable.length < 2 || totalMagnitude <= 0 || modelConfidence === 'LOW') {
    return { state: 'WARMING_UP', index: null, confidence: 'LOW', basis: 'LEARNED_EQUIPMENT_OUTCOME_ASSOCIATION', dimensionsUsed: usable.length, weights, reasonCodes: ['SERVICE_WORKLOAD_MODEL_EVIDENCE_LOW'] };
  }

  let ratio = 0;
  for (const item of usable) {
    const weight = item.magnitude / totalMagnitude;
    weights[item.key] = Math.round(weight * 1000) / 1000;
    const currentValue = current[item.key] as number;
    const referenceValue = reference[item.key] as number;
    ratio += weight * ((currentValue + 1) / (referenceValue + 1));
  }
  const confidence = modelConfidence === 'HIGH' && usable.every((item) => item.confidence === 'HIGH') ? 'HIGH' : 'MEDIUM';
  reasonCodes.push('SERVICE_WORKLOAD_INDEX_LEARNED_FROM_OUTCOMES');
  return {
    state: 'READY',
    index: Math.round(ratio * 1000) / 10,
    confidence,
    basis: 'LEARNED_EQUIPMENT_OUTCOME_ASSOCIATION',
    dimensionsUsed: usable.length,
    weights,
    reasonCodes,
  };
}
