/**
 * Route geometry for generated walks (spec §3 C2, §8 Refresh; m4-generation-design §2–§3).
 * The phone uses the view helpers and the Refresh check; Cloud Functions use the polyline and
 * spacing helpers. Pure, so both sides agree to the metre.
 */
import { distanceM } from './geo';
import { formatDistance, formatMinutes } from './format';
import { estimateWalkMinutes } from './rules';
import type { LatLng } from './types';

// ------------------------------------------------------------------ question count

/** C2's question stepper (spec §3 C2). */
export const QUESTION_COUNT_MIN = 4;
export const QUESTION_COUNT_MAX = 12;
/** The default follows the view's length: about one question per 350 m. */
export const METRES_PER_QUESTION = 350;
/**
 * Stops at least this far apart along the route, so unlock circles (up to 60 m) don't overlap
 * and GPS jitter can't unlock the next stop early.
 */
export const MIN_STOP_SPACING_M = 150;

export function clampQuestionCount(n: number): number {
  if (!Number.isFinite(n)) return QUESTION_COUNT_MIN;
  return Math.min(QUESTION_COUNT_MAX, Math.max(QUESTION_COUNT_MIN, Math.round(n)));
}

/** C2's default number of questions for a loop of this length, until the creator changes it. */
export function defaultQuestionCount(loopLengthM: number): number {
  return clampQuestionCount(loopLengthM / METRES_PER_QUESTION);
}

/** The shortest loop that fits this many stops: N × 150 m. */
export function minLoopLengthM(questionCount: number): number {
  return questionCount * MIN_STOP_SPACING_M;
}

// ------------------------------------------------------------------ the view (phone side)

/** A point on the screen, in the map view's own coordinates (as `coordinateForPoint` takes). */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** The map view's size and what covers it: the sheet, the header and the safe areas. */
export interface MapFrame {
  width: number;
  height: number;
  /** Covered edges, in the same units. `bottom` includes the sheet. */
  insets: { top: number; right: number; bottom: number; left: number };
}

/** The usable area is shrunk by this much before taking its edge midpoints (design §3, 15–20%). */
export const VIEW_SHRINK = 0.18;

/** The four points Refresh routes through, as screen points or as coordinates. */
export interface ViewDiamond<P> {
  /** Bottom centre: the Start pin, fixed on screen while the map moves under it. */
  start: P;
  left: P;
  top: P;
  right: P;
}

export interface ViewScreenPoints extends ViewDiamond<ScreenPoint> {
  /** The usable area's corners, unshrunk: bottom-left, bottom-right, top-right, top-left. */
  corners: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];
}

/**
 * The screen points C2 turns into coordinates with `coordinateForPoint` (which takes care of
 * rotation on both maps) before calling `routeForView`. The Start pin is drawn at `start`.
 */
export function viewScreenPoints(frame: MapFrame, shrink = VIEW_SHRINK): ViewScreenPoints {
  const x0 = frame.insets.left;
  const x1 = frame.width - frame.insets.right;
  const y0 = frame.insets.top;
  const y1 = frame.height - frame.insets.bottom;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const halfW = ((x1 - x0) / 2) * (1 - shrink);
  const halfH = ((y1 - y0) / 2) * (1 - shrink);
  return {
    start: { x: cx, y: cy + halfH },
    left: { x: cx - halfW, y: cy },
    top: { x: cx, y: cy - halfH },
    right: { x: cx + halfW, y: cy },
    corners: [
      { x: x0, y: y1 },
      { x: x1, y: y1 },
      { x: x1, y: y0 },
      { x: x0, y: y0 },
    ],
  };
}

/** Straight-line length of the loop start → left → top → right → start, in metres. */
export function straightLineLoopM(d: ViewDiamond<LatLng>): number {
  return (
    distanceM(d.start, d.left) +
    distanceM(d.left, d.top) +
    distanceM(d.top, d.right) +
    distanceM(d.right, d.start)
  );
}

export const REFRESH_TOO_SMALL_MESSAGE = 'Zoom out, or choose fewer questions';

export interface RefreshCheck {
  ok: boolean;
  /** Straight-line loop length: a walking route between the same points is almost always longer. */
  estimateM: number;
  minLengthM: number;
  /** Set when `ok` is false: the text under the disabled Refresh button. */
  message?: string;
}

/**
 * C2 runs this each time the map stops moving, before any network call. Below the minimum,
 * Refresh is disabled and says why (spec §8 Refresh, step 4).
 */
export function refreshCheck(view: ViewDiamond<LatLng>, questionCount: number): RefreshCheck {
  const estimateM = straightLineLoopM(view);
  const minLengthM = minLoopLengthM(questionCount);
  return estimateM >= minLengthM
    ? { ok: true, estimateM, minLengthM }
    : { ok: false, estimateM, minLengthM, message: REFRESH_TOO_SMALL_MESSAGE };
}

/** When the real route comes back too short; the previous route stays. */
export function tooShortMessage(questionCount: number): string {
  return `Couldn't fit ${questionCount} stops here. Zoom out a little.`;
}

/** The line under the map after a Refresh: "8 stops · 3.0 km · about 55 min" (spec §3 C2). */
export function walkSummaryLine(stopCount: number, distanceM: number): string {
  const minutes = formatMinutes(estimateWalkMinutes(distanceM, stopCount));
  return `${stopCount} stops · ${formatDistance(distanceM)} · ${minutes}`;
}

// ------------------------------------------------------------------ polylines

/** Encodes points with Google's polyline algorithm (precision 5, as OpenRouteService uses). */
export function encodePolyline(points: LatLng[], precision = 5): string {
  const factor = 10 ** precision;
  let out = '';
  let lastLat = 0;
  let lastLng = 0;
  const encode = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.latitude * factor);
    const lng = Math.round(p.longitude * factor);
    encode(lat - lastLat);
    encode(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

/** Decodes a polyline from `encodePolyline` or OpenRouteService (2D, precision 5). */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= encoded.length) throw new Error('Polyline ends mid-value');
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    lat += next();
    lng += next();
    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
}

// ------------------------------------------------------------------ local plane

/** Metres east (x) and north (y) of an origin. Accurate enough within a walk's few kilometres. */
export interface LocalPoint {
  x: number;
  y: number;
}

const M_PER_DEG_LAT = 111_195;

export function toLocal(origin: LatLng, p: LatLng): LocalPoint {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (p.longitude - origin.longitude) * mPerDegLng,
    y: (p.latitude - origin.latitude) * M_PER_DEG_LAT,
  };
}

export function fromLocal(origin: LatLng, p: LocalPoint): LatLng {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    latitude: origin.latitude + p.y / M_PER_DEG_LAT,
    longitude: origin.longitude + p.x / mPerDegLng,
  };
}

/** Whether a point is inside a polygon (ray casting on the local plane). */
export function pointInPolygon(polygon: LatLng[], p: LatLng): boolean {
  if (polygon.length < 3) return false;
  const origin = polygon[0] as LatLng;
  const q = toLocal(origin, p);
  const pts = polygon.map((v) => toLocal(origin, v));
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as LocalPoint;
    const b = pts[j] as LocalPoint;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// ------------------------------------------------------------------ along a line

/** Length of a line through the points, in metres. */
export function lineLengthM(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceM(points[i - 1] as LatLng, points[i] as LatLng);
  }
  return total;
}

const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({
  latitude: a.latitude + (b.latitude - a.latitude) * t,
  longitude: a.longitude + (b.longitude - a.longitude) * t,
});

/** The point this far along the line, clamped to its ends. */
export function pointAlongLine(points: LatLng[], alongM: number): LatLng {
  if (points.length === 0) throw new Error('Empty line');
  if (alongM <= 0) return points[0] as LatLng;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as LatLng;
    const b = points[i] as LatLng;
    const leg = distanceM(a, b);
    if (walked + leg >= alongM) return leg === 0 ? b : lerp(a, b, (alongM - walked) / leg);
    walked += leg;
  }
  return points[points.length - 1] as LatLng;
}

export interface SpacedStop {
  location: LatLng;
  /** Metres from the start along the route. */
  alongM: number;
}

/**
 * N stops evenly along the route: stop i of N at length × i / N (spec §8 Refresh, step 3).
 * On a loop the last stop is back at the start, so groups end where they met.
 */
export function spaceStops(route: LatLng[], count: number): SpacedStop[] {
  const length = lineLengthM(route);
  const stops: SpacedStop[] = [];
  for (let i = 1; i <= count; i++) {
    const alongM = (length * i) / count;
    stops.push({ location: pointAlongLine(route, alongM), alongM });
  }
  return stops;
}

export interface Projection {
  /** The nearest point on the line. */
  point: LatLng;
  /** Metres from the start of the line to that point. */
  alongM: number;
  /** Metres from the projected point to the line. */
  offsetM: number;
}

/**
 * The nearest point on the line to `p`. Where the line passes close by more than once, the
 * pass nearest to `nearAlongM` wins among those within 5 m of the best, so a stop moved to a
 * feature stays on its own part of an out-and-back route.
 */
export function projectOntoLine(points: LatLng[], p: LatLng, nearAlongM?: number): Projection {
  if (points.length === 0) throw new Error('Empty line');
  const origin = p;
  const candidates: Projection[] = [];
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as LatLng;
    const b = points[i] as LatLng;
    const la = toLocal(origin, a);
    const lb = toLocal(origin, b);
    const dx = lb.x - la.x;
    const dy = lb.y - la.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(la.x * dx + la.y * dy) / len2));
    const px = la.x + dx * t;
    const py = la.y + dy * t;
    const leg = distanceM(a, b);
    candidates.push({
      point: fromLocal(origin, { x: px, y: py }),
      alongM: walked + leg * t,
      offsetM: Math.hypot(px, py),
    });
    walked += leg;
  }
  if (candidates.length === 0) {
    return { point: points[0] as LatLng, alongM: 0, offsetM: distanceM(points[0] as LatLng, p) };
  }
  const best = Math.min(...candidates.map((c) => c.offsetM));
  const close = candidates.filter((c) => c.offsetM <= best + 5);
  if (nearAlongM === undefined) return close.find((c) => c.offsetM === best) as Projection;
  return close.reduce((x, y) =>
    Math.abs(y.alongM - nearAlongM) < Math.abs(x.alongM - nearAlongM) ? y : x,
  );
}

// ------------------------------------------------------------------ route freshness

/**
 * A short fingerprint of the start and the stops in order. Stored with a route, so the app and
 * publishWalk can tell whether the route still matches the pins: the routed distance is used
 * only while it does, and straight lines otherwise (spec §4 Distance).
 */
export function routeKey(start: LatLng, stopsInOrder: LatLng[]): string {
  const text = [start, ...stopsInOrder]
    .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
    .join(';');
  // FNV-1a, 32 bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * A stop is "Off path" when a team standing on the nearest walkable path might not reach its
 * unlock circle: the path is further from the pin than its radius less 10 m of GPS margin.
 */
export function isOffPath(offsetM: number, radiusM: number): boolean {
  return offsetM > radiusM - 10;
}
