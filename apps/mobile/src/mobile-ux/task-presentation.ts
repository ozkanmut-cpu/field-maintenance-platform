import { matchesSearch } from '../search';

export type TaskPresentationTask = {
  pointId: string;
  pointCode: string;
  pointName: string;
  regionName: string;
  priority: 'OVERDUE' | 'CURRENT';
  address?: string | null;
  aliases?: string[];
  latitude?: number | null;
  longitude?: number | null;
  coolerCount?: number | null;
  towerCount?: number | null;
  tapCount?: number | null;
  smarttapCount?: number | null;
};

type Coordinates = { latitude: number; longitude: number };

export function filterTasks<T extends TaskPresentationTask>(tasks: T[], query: string) {
  return tasks.filter(task => matchesSearch(query, [
    task.pointName,
    task.pointCode,
    task.regionName,
    task.address ?? '',
    ...(task.aliases ?? []),
  ]));
}

function distanceMeters(origin: Coordinates, task: TaskPresentationTask) {
  if (task.latitude == null || task.longitude == null) return Number.POSITIVE_INFINITY;
  const earthRadius = 6371000;
  const originLatitude = origin.latitude * Math.PI / 180;
  const taskLatitude = task.latitude * Math.PI / 180;
  const latitudeDifference = (task.latitude - origin.latitude) * Math.PI / 180;
  const longitudeDifference = (task.longitude - origin.longitude) * Math.PI / 180;
  const value = Math.sin(latitudeDifference / 2) ** 2 + Math.cos(originLatitude) * Math.cos(taskLatitude) * Math.sin(longitudeDifference / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function orderTasks<T extends TaskPresentationTask>(tasks: T[], deviceLocation?: Coordinates | null) {
  return tasks.slice().sort((left, right) => {
    const priority = Number(left.priority !== 'OVERDUE') - Number(right.priority !== 'OVERDUE');
    if (priority || !deviceLocation) return priority;
    return distanceMeters(deviceLocation, left) - distanceMeters(deviceLocation, right);
  });
}

export function weeklyTaskCounts(dashboard: { overdue: number; current: number; due: unknown[] }) {
  return { overdue: dashboard.overdue, current: dashboard.current, total: dashboard.due.length };
}

export function isEquipmentComplete(task: TaskPresentationTask) {
  return [task.coolerCount, task.towerCount, task.tapCount, task.smarttapCount].every(value => value != null);
}

export type LocationPresentationState = 'READY' | 'REVIEW_REQUIRED' | 'CANONICAL_LOCATION_MISSING';

export function locationPresentationState(input: {
  canonicalLatitude?: number | null;
  canonicalLongitude?: number | null;
  distanceMeters?: number | null;
  accuracyMeters?: number | null;
}): LocationPresentationState {
  if (input.canonicalLatitude == null || input.canonicalLongitude == null) return 'CANONICAL_LOCATION_MISSING';
  if (input.distanceMeters == null || input.accuracyMeters == null || !Number.isFinite(input.distanceMeters) || !Number.isFinite(input.accuracyMeters) || input.distanceMeters > 250 || input.accuracyMeters > 80) return 'REVIEW_REQUIRED';
  return 'READY';
}
