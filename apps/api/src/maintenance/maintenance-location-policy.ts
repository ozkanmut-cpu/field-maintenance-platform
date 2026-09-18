const EARTH_RADIUS_METERS = 6_371_000;

export type MaintenanceLocationInput = {
  enteredLate: boolean;
  suspiciousBatch: boolean;
  locationPresenceConfirmed: boolean;
  accuracyMeters?: number | null;
  visitLatitude: number;
  visitLongitude: number;
  canonicalLatitude?: number | null;
  canonicalLongitude?: number | null;
};

export type MaintenanceLocationDecision = {
  distanceMeters: number | null;
  locationLearningEligible: boolean;
  locationReviewRequired: boolean;
  reviewReason: string | null;
};

export function evaluateMaintenanceLocation(input: MaintenanceLocationInput): MaintenanceLocationDecision {
  const maxDistanceMeters = 250;
  const maxAccuracyMeters = 80;
  const hasCanonical = input.canonicalLatitude !== null && input.canonicalLatitude !== undefined &&
    input.canonicalLongitude !== null && input.canonicalLongitude !== undefined;
  const distanceMeters = hasCanonical
    ? distance(input.visitLatitude, input.visitLongitude, input.canonicalLatitude!, input.canonicalLongitude!)
    : null;
  const accurate = typeof input.accuracyMeters === 'number' && Number.isFinite(input.accuracyMeters) && input.accuracyMeters <= maxAccuracyMeters;
  const closeEnough = distanceMeters !== null && distanceMeters <= maxDistanceMeters;
  const locationReviewRequired = input.locationPresenceConfirmed && (!closeEnough || !accurate);
  const reasons: string[] = [];
  if (!hasCanonical) reasons.push('KAYITLI KONUM YOK');
  else if (!closeEnough) reasons.push(`KONUM UYUŞMAZLIĞI: ${Math.round(distanceMeters!)} m`);
  if (!accurate) reasons.push(input.accuracyMeters === null || input.accuracyMeters === undefined
    ? 'GPS HASSASİYETİ YOK'
    : `GPS HASSASİYETİ DÜŞÜK: ±${Math.round(input.accuracyMeters)} m`);

  return {
    distanceMeters,
    locationLearningEligible: !input.enteredLate && !input.suspiciousBatch && input.locationPresenceConfirmed && accurate && closeEnough,
    locationReviewRequired,
    reviewReason: reasons.length ? reasons.join(' | ') : null,
  };
}

function distance(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const latA = latitudeA * (Math.PI / 180);
  const latB = latitudeB * (Math.PI / 180);
  const deltaLat = latB - latA;
  const deltaLon = (longitudeB - longitudeA) * (Math.PI / 180);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
