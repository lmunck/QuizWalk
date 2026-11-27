import { describe, expect, it } from 'vitest';

import { distanceM } from './geo';
import {
  clampQuestionCount,
  decodePolyline,
  defaultQuestionCount,
  encodePolyline,
  fromLocal,
  isOffPath,
  lineLengthM,
  minLoopLengthM,
  pointAlongLine,
  pointInPolygon,
  projectOntoLine,
  refreshCheck,
  REFRESH_TOO_SMALL_MESSAGE,
  routeKey,
  spaceStops,
  straightLineLoopM,
  toLocal,
  tooShortMessage,
  viewScreenPoints,
  walkSummaryLine,
} from './route';
import type { LatLng } from './types';

const o: LatLng = { latitude: 55.68, longitude: 12.59 };
const at = (x: number, y: number) => fromLocal(o, { x, y });

/** A square loop of side `s` metres starting at o: east, north, west, back south. */
const square = (s: number) => [o, at(s, 0), at(s, s), at(0, s), o];

describe('question count', () => {
  it('defaults to about one per 350 m, within 4–12', () => {
    expect(defaultQuestionCount(0)).toBe(4);
    expect(defaultQuestionCount(1400)).toBe(4);
    expect(defaultQuestionCount(2800)).toBe(8);
    expect(defaultQuestionCount(3000)).toBe(9);
    expect(defaultQuestionCount(40_000)).toBe(12);
  });

  it('clamps the stepper', () => {
    expect(clampQuestionCount(2)).toBe(4);
    expect(clampQuestionCount(13)).toBe(12);
    expect(clampQuestionCount(Number.NaN)).toBe(4);
  });

  it('needs 150 m per question', () => {
    expect(minLoopLengthM(8)).toBe(1200);
    expect(minLoopLengthM(12)).toBe(1800);
  });
});

describe('the view', () => {
  const frame = {
    width: 400,
    height: 800,
    insets: { top: 100, right: 0, bottom: 300, left: 0 },
  };

  it('puts the Start pin at the bottom centre of the shrunk usable area', () => {
    const v = viewScreenPoints(frame, 0.2);
    // Usable area: x 0–400, y 100–500, centre (200, 300), shrunk half-sizes 160 × 160.
    expect(v.start).toEqual({ x: 200, y: 460 });
    expect(v.top).toEqual({ x: 200, y: 140 });
    expect(v.left).toEqual({ x: 40, y: 300 });
    expect(v.right).toEqual({ x: 360, y: 300 });
    expect(v.corners).toEqual([
      { x: 0, y: 500 },
      { x: 400, y: 500 },
      { x: 400, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it('measures the straight-line loop around the four points', () => {
    const view = { start: at(0, 0), left: at(-300, 400), top: at(0, 800), right: at(300, 400) };
    expect(straightLineLoopM(view)).toBeCloseTo(2000, -1);
  });

  it('disables Refresh below N × 150 m and says why', () => {
    const view = { start: at(0, 0), left: at(-300, 400), top: at(0, 800), right: at(300, 400) };
    expect(refreshCheck(view, 12)).toMatchObject({ ok: true, minLengthM: 1800 });
    const small = { start: at(0, 0), left: at(-95, 125), top: at(0, 250), right: at(95, 125) };
    expect(refreshCheck(small, 8)).toMatchObject({
      ok: false,
      minLengthM: 1200,
      message: REFRESH_TOO_SMALL_MESSAGE,
    });
    expect(refreshCheck(small, 4).ok).toBe(true);
  });

  it('words the summary and the too-short message', () => {
    expect(walkSummaryLine(8, 3000)).toBe('8 stops · 3.0 km · about 56 min');
    expect(tooShortMessage(8)).toBe("Couldn't fit 8 stops here. Zoom out a little.");
  });
});

describe('polylines', () => {
  it("decodes Google's reference example", () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it('round-trips', () => {
    const line = square(500);
    const back = decodePolyline(encodePolyline(line));
    back.forEach((p, i) => expect(distanceM(p, line[i] as LatLng)).toBeLessThan(1));
  });

  it('refuses a truncated polyline', () => {
    expect(() => decodePolyline('_p~iF~ps|U_')).toThrow();
  });
});

describe('along a line', () => {
  it('measures and walks a line', () => {
    const line = square(500);
    expect(lineLengthM(line)).toBeCloseTo(2000, 0);
    expect(distanceM(pointAlongLine(line, 750), at(500, 250))).toBeLessThan(1);
    expect(pointAlongLine(line, -5)).toEqual(o);
    expect(pointAlongLine(line, 99_999)).toEqual(o);
  });

  it('spaces stops at length × i / N, the last back at the start', () => {
    const stops = spaceStops(square(500), 8);
    expect(stops).toHaveLength(8);
    expect(stops.map((s) => Math.round(s.alongM))).toEqual([
      250, 500, 750, 1000, 1250, 1500, 1750, 2000,
    ]);
    expect(distanceM(stops[1]!.location, at(500, 0))).toBeLessThan(1);
    expect(distanceM(stops[7]!.location, o)).toBeLessThan(1);
  });

  it('projects a point onto the nearest part of the line', () => {
    const p = projectOntoLine(square(500), at(520, 100));
    expect(p.offsetM).toBeCloseTo(20, 0);
    expect(p.alongM).toBeCloseTo(600, 0);
  });

  it('picks the pass nearest the stop on an out-and-back line', () => {
    const line = [o, at(400, 0), o];
    expect(projectOntoLine(line, at(100, 10), 650).alongM).toBeCloseTo(700, 0);
    expect(projectOntoLine(line, at(100, 10), 50).alongM).toBeCloseTo(100, 0);
  });
});

describe('the local plane', () => {
  it('round-trips and keeps distances', () => {
    const p = at(300, -400);
    expect(distanceM(o, p)).toBeCloseTo(500, 0);
    const back = toLocal(o, p);
    expect(back.x).toBeCloseTo(300, 6);
    expect(back.y).toBeCloseTo(-400, 6);
  });

  it('tells inside from outside', () => {
    const poly = [at(0, 0), at(100, 0), at(100, 100), at(0, 100)];
    expect(pointInPolygon(poly, at(50, 50))).toBe(true);
    expect(pointInPolygon(poly, at(150, 50))).toBe(false);
    expect(pointInPolygon(poly.slice(0, 2), at(50, 50))).toBe(false);
  });
});

describe('route freshness and warnings', () => {
  it('changes the key when a pin moves or the order changes', () => {
    const a = at(100, 0);
    const b = at(200, 0);
    const key = routeKey(o, [a, b]);
    expect(key).toMatch(/^[0-9a-f]{8}$/);
    expect(routeKey(o, [a, b])).toBe(key);
    expect(routeKey(o, [b, a])).not.toBe(key);
    expect(routeKey(o, [a, at(200, 5)])).not.toBe(key);
  });

  it('is off path when the path is further than the radius less 10 m', () => {
    expect(isOffPath(29, 40)).toBe(false);
    expect(isOffPath(31, 40)).toBe(true);
    expect(isOffPath(16, 25)).toBe(true);
    expect(isOffPath(45, 60)).toBe(false);
  });
});
