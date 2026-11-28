/**
 * Compass maths for P3's arrow. The app feeds these from the platform's sensors; nothing here
 * touches a device, so it can be tested.
 */

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The way the person holding the phone faces, in degrees clockwise from magnetic north, from
 * Android's rotation matrix (`SensorManager.getRotationMatrixFromVector`: row-major, device to
 * world, world x = east, y = north, z = up).
 *
 * A phone held in portrait has its left–right axis (device x) level and square to the way its
 * holder faces, whether it lies flat or stands upright to be read. So the heading is
 * world-up × device-x, which keeps working at any tilt. Android's own `getOrientation` uses the
 * top edge (device y) instead, which points at the sky when the phone is upright: that is what
 * made the old arrow swing. Returns undefined when the phone is on its side (device x near
 * vertical), where no heading makes sense.
 */
export function headingFromRotationMatrix(m: readonly number[]): number | undefined {
  const xEast = m[0];
  const xNorth = m[3];
  if (xEast === undefined || xNorth === undefined) return undefined;
  if (Math.hypot(xEast, xNorth) < 0.35) return undefined;
  return (toDeg(Math.atan2(-xNorth, xEast)) + 360) % 360;
}

/** Heading uncertainty below which the arrow is shown rather than the text direction. */
export const COMPASS_GOOD_ACCURACY_DEG = 35;

/**
 * Whether Android's fused heading is good enough for the arrow. `accuracyDeg` is the sensor's
 * own estimate when the phone gives one; otherwise `status` is the sensor's accuracy level
 * (0 unreliable, 1 low, 2 medium, 3 high, -1 not reported yet, which is trusted).
 */
export function androidCompassGood(accuracyDeg: number | null | undefined, status: number): boolean {
  if (accuracyDeg != null && accuracyDeg > 0) return accuracyDeg <= COMPASS_GOOD_ACCURACY_DEG;
  return status < 0 || status >= 2;
}

/** A heading smoothed as a direction, so 359° and 1° average to 0°, not 180°. */
export interface SmoothedHeading {
  sin: number;
  cos: number;
  atMs: number;
}

/** Time constant of the smoothing: the arrow follows a turn within about a second. */
export const HEADING_SMOOTHING_MS = 300;

/**
 * Folds a new reading into the smoothed heading. Readings come at uneven intervals, so the
 * weight depends on the time since the last one. After a gap of more than two seconds the new
 * reading is taken as it is.
 */
export function smoothHeading(
  prev: SmoothedHeading | undefined,
  headingDeg: number,
  atMs: number,
  tauMs = HEADING_SMOOTHING_MS,
): SmoothedHeading {
  const sin = Math.sin(toRad(headingDeg));
  const cos = Math.cos(toRad(headingDeg));
  const dt = prev ? atMs - prev.atMs : Infinity;
  if (!prev || dt > 2000 || dt < 0) return { sin, cos, atMs };
  const a = 1 - Math.exp(-dt / tauMs);
  return { sin: prev.sin + a * (sin - prev.sin), cos: prev.cos + a * (cos - prev.cos), atMs };
}

export function smoothedDeg(s: SmoothedHeading): number {
  return (toDeg(Math.atan2(s.sin, s.cos)) + 360) % 360;
}

/** The smallest turn from one heading to another, in degrees (0–180). */
export function headingDelta(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

export interface CompassTrust {
  good: boolean;
  /** When readings started disagreeing with `good`. */
  changingSinceMs?: number;
}

/** How long readings must disagree before the arrow appears or gives way to text. */
export const COMPASS_TRUST_HOLD_MS = 1500;

/**
 * Whether to trust the compass, with a short hold so one odd reading doesn't swap the arrow and
 * the text back and forth. The first reading decides at once.
 */
export function nextCompassTrust(
  prev: CompassTrust | undefined,
  readingGood: boolean,
  atMs: number,
  holdMs = COMPASS_TRUST_HOLD_MS,
): CompassTrust {
  if (!prev) return { good: readingGood };
  if (readingGood === prev.good) return { good: prev.good };
  if (prev.changingSinceMs === undefined) return { good: prev.good, changingSinceMs: atMs };
  if (atMs - prev.changingSinceMs >= holdMs) return { good: readingGood };
  return prev;
}
