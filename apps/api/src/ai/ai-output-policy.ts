import { CapabilityMaturity } from './data-maturity.types';
import { DataQualityAssessment } from './data-quality-engine.types';

export type AiDataQualityState = 'BLOCKED' | 'LIMITED' | 'READY';
export type AiPolicyConfidence = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';

export type AiOutputPolicy = {
  allowed: boolean;
  maturityState: CapabilityMaturity['state'] | 'UNKNOWN';
  dataQualityState: AiDataQualityState;
  confidenceCap: AiPolicyConfidence;
  reasonCodes: string[];
};

export function evaluateAiOutputPolicy(
  maturity: CapabilityMaturity | undefined,
  quality: DataQualityAssessment | undefined,
): AiOutputPolicy {
  const maturityReady = maturity?.state === 'ACTIVE' || maturity?.state === 'RELIABLE';
  const score = quality?.score ?? null;
  const blocked = score !== null && score < 50;
  const limited = !blocked && quality !== undefined && (score! < 70 || quality.confidence === 'LOW');
  const reasonCodes: string[] = [];
  if (!maturityReady) reasonCodes.push('AI_MATURITY_GATE_NOT_READY');
  if (blocked) reasonCodes.push('AI_DATA_QUALITY_GATE_BLOCKED');
  else if (limited) reasonCodes.push('AI_DATA_QUALITY_LIMITED');
  return {
    allowed: maturityReady && !blocked,
    maturityState: maturity?.state ?? 'UNKNOWN',
    dataQualityState: blocked ? 'BLOCKED' : limited ? 'LIMITED' : 'READY',
    confidenceCap: !maturityReady || blocked ? 'UNKNOWN' : limited ? 'LOW' : maturity?.state === 'RELIABLE' ? 'HIGH' : 'MEDIUM',
    reasonCodes,
  };
}
