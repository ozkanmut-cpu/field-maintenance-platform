export const MAX_TRUSTED_LOCATION_DISTANCE_METERS = 250;

export const LOCATION_CHOICES = {
  HERE: 'Evet, noktadayım',
  COMPLETED_ELSEWHERE: 'Hayır, ama bakımı yaptım',
  CANCEL: 'İptal et',
} as const;

export type MaintenanceLocationChoice = keyof typeof LOCATION_CHOICES;

export type CapturedMaintenanceLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
};

type PointLocation = { latitude: number; longitude: number };

export type MaintenanceLocationPlan =
  | { kind: 'PAST_DATE' }
  | {
      kind: 'SAVE_CURRENT';
      currentLocation: CapturedMaintenanceLocation;
      locationPresenceConfirmed: true;
    }
  | {
      kind: 'PROMPT';
      currentLocation: CapturedMaintenanceLocation;
      distanceMeters: number | null;
      detail: string;
    };

export function planMaintenanceLocation(input: {
  pastDated: boolean;
  currentLocation?: CapturedMaintenanceLocation;
  pointLocation?: PointLocation;
}): MaintenanceLocationPlan {
  if (input.pastDated) return { kind: 'PAST_DATE' };
  if (!input.currentLocation) throw new Error('Güncel bakım için konum gereklidir.');

  const distanceMeters = input.pointLocation
    ? distance(
        input.currentLocation.latitude,
        input.currentLocation.longitude,
        input.pointLocation.latitude,
        input.pointLocation.longitude,
      )
    : null;

  if (distanceMeters !== null && distanceMeters <= MAX_TRUSTED_LOCATION_DISTANCE_METERS) {
    return {
      kind: 'SAVE_CURRENT',
      currentLocation: input.currentLocation,
      locationPresenceConfirmed: true,
    };
  }
  return {
    kind: 'PROMPT',
    currentLocation: input.currentLocation,
    distanceMeters,
    detail: distanceMeters === null
      ? 'Bu noktanın kayıtlı konumu yok.'
      : `Kayıtlı noktadan yaklaşık ${Math.round(distanceMeters)} metre uzaktasınız.`,
  };
}

export async function applyMaintenanceLocationChoice<T>(
  choice: MaintenanceLocationChoice,
  save: (locationPresenceConfirmed: boolean) => Promise<T>,
): Promise<{ saved: false } | {
  saved: true;
  locationPresenceConfirmed: boolean;
  value: T;
}> {
  if (choice === 'CANCEL') return { saved: false };
  const locationPresenceConfirmed = choice === 'HERE';
  const value = await save(locationPresenceConfirmed);
  return { saved: true, locationPresenceConfirmed, value };
}

function distance(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radius = 6_371_000;
  const latA = latitudeA * (Math.PI / 180);
  const latB = latitudeB * (Math.PI / 180);
  const deltaLat = latB - latA;
  const deltaLon = (longitudeB - longitudeA) * (Math.PI / 180);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
