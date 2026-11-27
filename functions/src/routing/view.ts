/**
 * routeForView: C2's Refresh (spec §8 "Generated walks", m4-generation-design §3). Four points
 * → a walking loop that fits the view, with N stops spaced along it. Writes nothing and spends
 * no tokens: one or two routing calls, a few more only when a point has to be moved.
 */
import {
  clampQuestionCount,
  fromLocal,
  minLoopLengthM,
  pointInPolygon,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
  seededRng,
  spaceStops,
  straightLineLoopM,
  toLocal,
  tooShortMessage,
  type LatLng,
  type RouteForViewRequest,
  type RouteForViewResponse,
  type ViewDiamond,
} from '@qualk/shared';

import { QualkError } from '../errors';
import { RoutingError, type RoutedLine, type WalkingRouter } from './router';

/** A point with no path near it is moved this far towards the start (of its distance). */
export const MOVE_TOWARDS_START = 0.3;
/** When the route leaves the view, the far points are pulled in to this share and tried again. */
export const SHRINK_TO = 0.75;
/** Route points may lie this much outside the view (as a share of its size) and still fit. */
export const FIT_TOLERANCE = 0.05;
/** A Refresh never makes more routing calls than this. */
export const MAX_ROUTING_CALLS = 5;

type Diamond = ViewDiamond<LatLng>;
const FAR = ['left', 'top', 'right'] as const;

function isLatLng(v: unknown): v is LatLng {
  const p = v as LatLng;
  return (
    typeof p?.latitude === 'number' &&
    typeof p?.longitude === 'number' &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}

/** Checks the request's shape; the numbers come from the phone. */
export function parseRouteForView(data: unknown): Required<RouteForViewRequest> {
  const req = (data ?? {}) as Partial<RouteForViewRequest>;
  const view = req.view as Diamond | undefined;
  if (!view || ![view.start, view.left, view.top, view.right].every(isLatLng)) {
    throw new QualkError('invalid-argument', 'The view is missing its four points.');
  }
  if (!Array.isArray(req.corners) || req.corners.length !== 4 || !req.corners.every(isLatLng)) {
    throw new QualkError('invalid-argument', 'The view is missing its corners.');
  }
  const n = req.questionCount;
  if (typeof n !== 'number' || n < QUESTION_COUNT_MIN || n > QUESTION_COUNT_MAX) {
    throw new QualkError(
      'invalid-argument',
      `Choose ${QUESTION_COUNT_MIN} to ${QUESTION_COUNT_MAX} questions.`,
    );
  }
  const variant = Number.isInteger(req.variant) && (req.variant as number) > 0 ? req.variant : 0;
  return {
    view: { start: view.start, left: view.left, top: view.top, right: view.right },
    corners: req.corners,
    questionCount: clampQuestionCount(n),
    variant: variant as number,
  };
}

/** Moves a far point a share of its way to the start. */
function towardsStart(start: LatLng, p: LatLng, share: number): LatLng {
  const v = toLocal(start, p);
  return fromLocal(start, { x: v.x * (1 - share), y: v.y * (1 - share) });
}

export function shrinkDiamond(d: Diamond, to: number): Diamond {
  const out = { ...d };
  for (const k of FAR) out[k] = towardsStart(d.start, d[k], 1 - to);
  return out;
}

/**
 * A second Refresh on the same view moves the three far points a little: each turns up to
 * 10° about the start and stretches between 85% and 105%. The same variant gives the same
 * route, so a retry is repeatable.
 */
export function varyDiamond(d: Diamond, variant: number): Diamond {
  if (variant <= 0) return d;
  const rng = seededRng(variant * 7919 + 17);
  const out = { ...d };
  for (const k of FAR) {
    const v = toLocal(d.start, d[k]);
    const angle = ((rng() * 2 - 1) * 10 * Math.PI) / 180;
    const scale = 0.85 + rng() * 0.2;
    const x = (v.x * Math.cos(angle) - v.y * Math.sin(angle)) * scale;
    const y = (v.x * Math.sin(angle) + v.y * Math.cos(angle)) * scale;
    out[k] = fromLocal(d.start, { x, y });
  }
  return out;
}

/** The view's corners as a polygon, sorted around their centre and grown by the tolerance. */
export function viewPolygon(corners: LatLng[], tolerance = FIT_TOLERANCE): LatLng[] {
  const origin = corners[0] as LatLng;
  const pts = corners.map((c) => toLocal(origin, c));
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return pts
    .map((p) => ({ x: cx + (p.x - cx) * (1 + tolerance), y: cy + (p.y - cy) * (1 + tolerance) }))
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
    .map((p) => fromLocal(origin, p));
}

export function fitsView(line: LatLng[], polygon: LatLng[]): boolean {
  return line.every((p) => pointInPolygon(polygon, p));
}

const unroutableStart = () =>
  new QualkError('failed-precondition', 'The start pin isn’t near a path. Move the map a little.', {
    reason: 'unroutable',
  });

/**
 * Routes start → left → top → right → start. A far point with no path near it is moved towards
 * the start and the loop tried again; if no route joins the points, all three are pulled in.
 */
async function routeLoop(
  router: WalkingRouter,
  diamond: Diamond,
  budget: { calls: number },
): Promise<RoutedLine> {
  let d = { ...diamond };
  for (;;) {
    if (budget.calls <= 0) {
      throw new QualkError('failed-precondition', 'No walking paths here. Move the map.', {
        reason: 'unroutable',
      });
    }
    budget.calls--;
    try {
      return await router.route([d.start, d.left, d.top, d.right, d.start]);
    } catch (err) {
      if (!(err instanceof RoutingError)) throw err;
      if (err.failure === 'unavailable') {
        throw new QualkError('unavailable', 'Routing isn’t available right now. Try again.', {
          reason: 'unavailable',
        });
      }
      if (err.failure === 'tooBig') {
        throw new QualkError('failed-precondition', 'This view is too big to route. Zoom in.', {
          reason: 'tooBig',
        });
      }
      if (err.failure === 'unroutable' && err.pointIndex !== undefined) {
        if (err.pointIndex === 0 || err.pointIndex === 4) throw unroutableStart();
        const k = FAR[err.pointIndex - 1] as (typeof FAR)[number];
        d = { ...d, [k]: towardsStart(d.start, d[k], MOVE_TOWARDS_START) };
      } else {
        d = shrinkDiamond(d, 1 - MOVE_TOWARDS_START);
      }
    }
  }
}

export async function routeForView(
  router: WalkingRouter,
  data: unknown,
): Promise<RouteForViewResponse> {
  const req = parseRouteForView(data);
  const n = req.questionCount;
  const minLengthM = minLoopLengthM(n);
  const estimateM = straightLineLoopM(req.view);
  // The phone checks this first (refreshCheck); a route can't be shorter than a straight line
  // through the same points, so there is no point calling the router.
  if (estimateM < minLengthM) {
    throw new QualkError('failed-precondition', tooShortMessage(n), {
      reason: 'tooShort',
      minLengthM,
      distanceM: Math.round(estimateM),
    });
  }

  const polygon = viewPolygon(req.corners);
  const budget = { calls: MAX_ROUTING_CALLS };
  const diamond = varyDiamond(req.view, req.variant);
  const first = await routeLoop(router, diamond, budget);
  let chosen = first;
  let fits = fitsView(first.points, polygon);
  if (!fits && budget.calls > 0) {
    try {
      const shrunk = await routeLoop(router, shrinkDiamond(diamond, SHRINK_TO), budget);
      const shrunkFits = fitsView(shrunk.points, polygon);
      // Keep the shrunk loop unless it is too short and the first one wasn't.
      if (shrunk.distanceM >= minLengthM || first.distanceM < minLengthM) {
        chosen = shrunk;
        fits = shrunkFits;
      }
    } catch (err) {
      // The first route is still a good answer.
      if (!(err instanceof QualkError)) throw err;
    }
  }

  if (chosen.distanceM < minLengthM) {
    throw new QualkError('failed-precondition', tooShortMessage(n), {
      reason: 'tooShort',
      minLengthM,
      distanceM: chosen.distanceM,
    });
  }

  const stops = spaceStops(chosen.points, n);
  return {
    route: { polyline: chosen.polyline, distanceM: chosen.distanceM, durationS: chosen.durationS },
    start: chosen.points[0] as LatLng,
    stops,
    fitsView: fits,
  };
}
