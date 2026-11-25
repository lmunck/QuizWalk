import type { LatLng } from './types';

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b` in degrees, 0 = north, clockwise, in [0, 360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Straight-line length of a walk in metres: start → stop 1 → … → last stop.
 * The way back to the start is not counted; the game ends at the last stop.
 */
export function walkDistanceM(start: LatLng, stopsInOrder: LatLng[]): number {
  let total = 0;
  let from = start;
  for (const stop of stopsInOrder) {
    total += distanceM(from, stop);
    from = stop;
  }
  return total;
}

/** P1 says "Ends 2.1 km from the start" when the last stop is further away than this. */
export const ENDS_AWAY_MIN_M = 300;

/** Distance from the last stop back to the start, or 0 for a walk with no stops. */
export function endsAwayM(start: LatLng, stopsInOrder: LatLng[]): number {
  const last = stopsInOrder[stopsInOrder.length - 1];
  return last ? distanceM(last, start) : 0;
}

/** §9 Uploads: distance walked ignores poor fixes and jitter. */
export const DISTANCE_MAX_ACCURACY_M = 30;
export const DISTANCE_MIN_SEGMENT_M = 5;

/** Faster than this between two fixes is a GPS jump, not walking (7 m/s ≈ 25 km/h). */
export const DISTANCE_MAX_SPEED_M_PER_S = 7;

/**
 * Whether a segment between two fixes counts towards `distanceWalkedM`. With the seconds
 * between the fixes, a segment covered faster than anyone walks is ignored as a GPS jump.
 */
export function countsTowardsDistance(
  segmentM: number,
  accuracyM: number,
  seconds?: number,
): boolean {
  if (accuracyM > DISTANCE_MAX_ACCURACY_M || segmentM < DISTANCE_MIN_SEGMENT_M) return false;
  if (seconds !== undefined && segmentM / Math.max(seconds, 1) > DISTANCE_MAX_SPEED_M_PER_S) {
    return false;
  }
  return true;
}

/** §9 Uploads: `positions/{uid}` is written at most every 30 s and only after moving ≥ 20 m. */
export const POSITION_UPLOAD_MIN_INTERVAL_MS = 30_000;
export const POSITION_UPLOAD_MIN_MOVE_M = 20;

export function shouldUploadPosition(msSinceLastUpload: number, movedM: number): boolean {
  return (
    msSinceLastUpload >= POSITION_UPLOAD_MIN_INTERVAL_MS && movedM >= POSITION_UPLOAD_MIN_MOVE_M
  );
}

/**
 * Where a new stop goes (spec §3 G2): into the leg it lengthens least, or after the last stop.
 * Returns the 0-based position for the new stop among the existing ones.
 */
export function bestInsertIndex(start: LatLng, stopsInOrder: LatLng[], point: LatLng): number {
  if (stopsInOrder.length === 0) return 0;
  let best = stopsInOrder.length;
  const last = stopsInOrder[stopsInOrder.length - 1] as LatLng;
  let bestCost = distanceM(last, point);
  let from = start;
  stopsInOrder.forEach((to, i) => {
    const cost = distanceM(from, point) + distanceM(point, to) - distanceM(from, to);
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
    from = to;
  });
  return best;
}

/** "between 5 and 6", "before stop 1", "after stop 4" for an insert position (1-based words). */
export function insertPositionLabel(index: number, count: number): string {
  if (count === 0) return 'as stop 1';
  if (index === 0) return 'before stop 1';
  if (index >= count) return `after stop ${count}`;
  return `between ${index} and ${index + 1}`;
}
