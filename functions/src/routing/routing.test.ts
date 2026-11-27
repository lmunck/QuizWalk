import {
  decodePolyline,
  distanceM,
  fromLocal,
  lineLengthM,
  type LatLng,
  type RouteForViewRequest,
} from '@qualk/shared';
import { describe, expect, it } from 'vitest';

import { QualkError } from '../errors';
import { fakeFetch, fixture } from '../testing';
import { orsRouter, unroutableIndex } from './ors';
import { RoutingError, type RoutedLine, type WalkingRouter } from './router';
import { routeForView, shrinkDiamond, varyDiamond, viewPolygon } from './view';

const loop = fixture<{ body: { routes: { geometry: string; summary: { distance: number } }[] } }>(
  'ors-loop',
).body;
const unroutable = fixture<{ status: number; body: unknown }>('ors-unroutable');

// The view the recorded loop was made for (start, left, top, right near Nyhavn).
const view = {
  start: { latitude: 55.67985, longitude: 12.5906 },
  left: { latitude: 55.683, longitude: 12.584 },
  top: { latitude: 55.687, longitude: 12.5915 },
  right: { latitude: 55.683, longitude: 12.5975 },
};
const corners: LatLng[] = [
  { latitude: 55.6785, longitude: 12.581 },
  { latitude: 55.6785, longitude: 12.6005 },
  { latitude: 55.6885, longitude: 12.6005 },
  { latitude: 55.6885, longitude: 12.581 },
];
const request = (over: Partial<RouteForViewRequest> = {}): RouteForViewRequest => ({
  view,
  corners,
  questionCount: 8,
  ...over,
});

describe('OpenRouteService', () => {
  it('sends the waypoints as lng,lat with the key, and reads the recorded loop', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const router = orsRouter('test-key', fakeFetch([{ match: () => true, body: loop }], calls));
    const line = await router.route([view.start, view.left, view.top, view.right, view.start]);
    expect(calls[0]!.url).toBe(
      'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/json',
    );
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('test-key');
    const body = JSON.parse(calls[0]!.init!.body as string);
    expect(body.coordinates[0]).toEqual([12.5906, 55.67985]);
    expect(body.options.avoid_features).toEqual(['ferries']);
    expect(line.distanceM).toBe(Math.round(loop.routes[0]!.summary.distance));
    expect(line.points.length).toBeGreaterThan(20);
    expect(line.wayPoints).toHaveLength(5);
    // A loop: it ends where it starts.
    expect(distanceM(line.points[0]!, line.points[line.points.length - 1]!)).toBeLessThan(1);
  });

  it('reads which point has no path near it from the recorded 2010 error', async () => {
    const router = orsRouter(
      'k',
      fakeFetch([{ match: () => true, status: unroutable.status, body: unroutable.body }]),
    );
    const err = await router.route([view.start, view.top]).catch((e) => e);
    expect(err).toBeInstanceOf(RoutingError);
    expect(err).toMatchObject({ failure: 'unroutable', pointIndex: 2 });
    expect(unroutableIndex('… of specified coordinate 3: 12.1 55.2.')).toBe(3);
    expect(unroutableIndex('Point was not found.')).toBeUndefined();
  });

  it('maps limits, missing routes and outages', async () => {
    const answer = (status: number, body: unknown) =>
      orsRouter('k', fakeFetch([{ match: () => true, status, body }])).route([view.start]);
    await expect(answer(400, { error: { code: 2004, message: 'too far' } })).rejects.toMatchObject({
      failure: 'tooBig',
    });
    await expect(answer(404, { error: { code: 2009, message: 'no route' } })).rejects.toMatchObject(
      { failure: 'noRoute' },
    );
    await expect(answer(503, 'down')).rejects.toMatchObject({ failure: 'unavailable' });
  }, 20_000);
});

/** A router that answers from a script of results, recording each call's waypoints. */
function scripted(results: (RoutedLine | RoutingError)[]): WalkingRouter & { calls: LatLng[][] } {
  const calls: LatLng[][] = [];
  return {
    calls,
    async route(waypoints) {
      calls.push(waypoints);
      const next = results.shift();
      if (!next) throw new Error('unexpected call');
      if (next instanceof RoutingError) throw next;
      return next;
    },
  };
}

const recorded = (): RoutedLine => {
  const points = decodePolyline(loop.routes[0]!.geometry);
  return {
    points,
    polyline: loop.routes[0]!.geometry,
    distanceM: Math.round(loop.routes[0]!.summary.distance),
    durationS: 2500,
    wayPoints: [0, 10, 20, 30, points.length - 1],
  };
};

describe('routeForView', () => {
  it('spaces N stops along the loop, the last back at the start, inside the view', async () => {
    const router = scripted([recorded()]);
    const res = await routeForView(router, request());
    expect(router.calls).toHaveLength(1);
    expect(res.fitsView).toBe(true);
    expect(res.stops).toHaveLength(8);
    const length = lineLengthM(recorded().points);
    res.stops.forEach((s, i) => expect(s.alongM).toBeCloseTo((length * (i + 1)) / 8, 3));
    expect(distanceM(res.stops[7]!.location, res.start)).toBeLessThan(1);
    expect(res.route.polyline).toBe(loop.routes[0]!.geometry);
    expect(res.route.key).toBeUndefined();
  });

  it('refuses before routing when the straight-line loop is too short', async () => {
    const router = scripted([]);
    // Half the view: a straight-line loop of about 1.17 km, short of 8 × 150 m.
    const small = shrinkDiamond(view, 0.5);
    const err = await routeForView(router, request({ view: small })).catch((e) => e);
    expect(err).toBeInstanceOf(QualkError);
    expect(err.details).toMatchObject({ reason: 'tooShort', minLengthM: 1200 });
    expect(err.message).toBe("Couldn't fit 8 stops here. Zoom out a little.");
    expect(router.calls).toHaveLength(0);
  });

  it('keeps the previous route when the real route comes back too short', async () => {
    const short = { ...recorded(), distanceM: 900 };
    const err = await routeForView(scripted([short, short]), request()).catch((e) => e);
    expect(err.details).toMatchObject({ reason: 'tooShort', minLengthM: 1200, distanceM: 900 });
  });

  it('moves a point with no path near it towards the start and tries again', async () => {
    const router = scripted([new RoutingError('unroutable', 'no path', 2), recorded()]);
    await routeForView(router, request());
    expect(router.calls).toHaveLength(2);
    const [first, second] = router.calls as [LatLng[], LatLng[]];
    expect(distanceM(second[2]!, view.start)).toBeCloseTo(
      distanceM(first[2]!, view.start) * 0.7,
      0,
    );
    expect(second[1]).toEqual(first[1]);
  });

  it('says so when the start has no path near it', async () => {
    const err = await routeForView(
      scripted([new RoutingError('unroutable', 'no path', 0)]),
      request(),
    ).catch((e) => e);
    expect(err.details).toMatchObject({ reason: 'unroutable' });
  });

  it('shrinks the shape and routes once more when the route leaves the view', async () => {
    const wide = recorded();
    const outside = {
      ...wide,
      points: [...wide.points, fromLocal(view.start, { x: 3000, y: 0 }), view.start],
    };
    const router = scripted([outside, recorded()]);
    const res = await routeForView(router, request());
    expect(router.calls).toHaveLength(2);
    expect(res.fitsView).toBe(true);
    const shrunkTop = router.calls[1]![2]!;
    expect(distanceM(shrunkTop, view.start)).toBeCloseTo(distanceM(view.top, view.start) * 0.75, 0);
  });

  it('gives a different, repeatable shape for each variant', () => {
    expect(varyDiamond(view, 0)).toEqual(view);
    const v1 = varyDiamond(view, 1);
    expect(v1).toEqual(varyDiamond(view, 1));
    expect(v1.start).toEqual(view.start);
    expect(distanceM(v1.top, view.top)).toBeGreaterThan(5);
    expect(distanceM(varyDiamond(view, 2).top, v1.top)).toBeGreaterThan(5);
  });

  it('shrinks towards the fixed Start pin', () => {
    const s = shrinkDiamond(view, 0.5);
    expect(s.start).toEqual(view.start);
    expect(distanceM(s.top, view.start)).toBeCloseTo(distanceM(view.top, view.start) / 2, 0);
  });

  it('accepts the corners in any order', () => {
    const shuffledCorners = [corners[2]!, corners[0]!, corners[3]!, corners[1]!];
    expect(
      viewPolygon(shuffledCorners, 0)
        .map((p) => p.latitude.toFixed(4))
        .sort(),
    ).toEqual(corners.map((p) => p.latitude.toFixed(4)).sort());
  });

  it('turns routing outages into a message the app can show', async () => {
    const err = await routeForView(
      scripted([new RoutingError('unavailable', 'down')]),
      request(),
    ).catch((e) => e);
    expect(err).toMatchObject({ code: 'unavailable', details: { reason: 'unavailable' } });
  });

  it.each([
    [{ view: undefined }, 'The view is missing its four points.'],
    [{ corners: [] }, 'The view is missing its corners.'],
    [{ questionCount: 3 }, 'Choose 4 to 12 questions.'],
    [{ questionCount: 13 }, 'Choose 4 to 12 questions.'],
  ])('refuses a bad request %o', async (change, message) => {
    const err = await routeForView(scripted([]), { ...request(), ...change }).catch((e) => e);
    expect(err).toMatchObject({ code: 'invalid-argument', message });
  });
});
