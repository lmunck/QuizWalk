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

/** §9 Uploads: distance walked ignores poor fixes and jitter. */
export const DISTANCE_MAX_ACCURACY_M = 30;
export const DISTANCE_MIN_SEGMENT_M = 5;

/** Whether a segment between two fixes counts towards `distanceWalkedM`. */
export function countsTowardsDistance(segmentM: number, accuracyM: number): boolean {
  return accuracyM <= DISTANCE_MAX_ACCURACY_M && segmentM >= DISTANCE_MIN_SEGMENT_M;
}

/** §9 Uploads: `positions/{uid}` is written at most every 30 s and only after moving ≥ 20 m. */
export const POSITION_UPLOAD_MIN_INTERVAL_MS = 30_000;
export const POSITION_UPLOAD_MIN_MOVE_M = 20;

export function shouldUploadPosition(msSinceLastUpload: number, movedM: number): boolean {
  return (
    msSinceLastUpload >= POSITION_UPLOAD_MIN_INTERVAL_MS && movedM >= POSITION_UPLOAD_MIN_MOVE_M
  );
}
