import { describe, expect, it } from 'vitest';

import {
  androidCompassGood,
  headingDelta,
  headingFromRotationMatrix,
  nextCompassTrust,
  smoothedDeg,
  smoothHeading,
} from './compass';

type M3 = number[][];
const mul = (a: M3, b: M3): M3 =>
  a.map((row) => b[0]!.map((_, j) => row.reduce((s, v, k) => s + v * b[k]![j]!, 0)));
const rad = (d: number) => (d * Math.PI) / 180;

/** Turned to face `yaw` (clockwise from north). */
const yawM = (yaw: number): M3 => {
  const c = Math.cos(rad(yaw));
  const s = Math.sin(rad(yaw));
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ];
};
/** Top edge tilted up by `deg` (0 flat, 90 upright facing the holder). */
const pitchM = (deg: number): M3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
};
/** Turned in the plane of the screen (a twist, seen by the holder). */
const twistM = (deg: number): M3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
};
/** Tilted sideways about the phone's long axis. */
const rollM = (deg: number): M3 => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
};
const flat = (m: M3) => m.flat();

describe('headingFromRotationMatrix', () => {
  it('reads a phone lying flat', () => {
    for (const yaw of [0, 45, 90, 180, 270, 359]) {
      expect(headingFromRotationMatrix(flat(yawM(yaw)))).toBeCloseTo(yaw % 360, 6);
    }
  });

  it('reads a phone held upright to be read, where the top edge points at the sky', () => {
    for (const yaw of [0, 30, 135, 300]) {
      expect(headingFromRotationMatrix(flat(mul(yawM(yaw), pitchM(90))))).toBeCloseTo(yaw, 6);
    }
  });

  it('is the same at every tilt between flat and upright', () => {
    for (const pitch of [10, 30, 60, 80, 100]) {
      expect(headingFromRotationMatrix(flat(mul(yawM(45), pitchM(pitch))))).toBeCloseTo(45, 6);
    }
  });

  it('ignores a sideways tilt of a flat phone', () => {
    expect(headingFromRotationMatrix(flat(mul(yawM(200), rollM(30))))).toBeCloseTo(200, 6);
  });

  it('ignores a twist of an upright phone', () => {
    const m = mul(mul(yawM(80), pitchM(90)), twistM(20));
    expect(headingFromRotationMatrix(flat(m))).toBeCloseTo(80, 6);
  });

  it('gives no heading for a phone on its side', () => {
    const m = mul(mul(yawM(80), pitchM(90)), twistM(90));
    expect(headingFromRotationMatrix(flat(m))).toBeUndefined();
  });

  it('gives no heading for a short matrix', () => {
    expect(headingFromRotationMatrix([1, 0])).toBeUndefined();
  });
});

describe('androidCompassGood', () => {
  it("uses the sensor's own estimate when there is one", () => {
    expect(androidCompassGood(12, 0)).toBe(true);
    expect(androidCompassGood(50, 3)).toBe(false);
  });
  it('falls back to the accuracy level', () => {
    expect(androidCompassGood(null, 3)).toBe(true);
    expect(androidCompassGood(null, 2)).toBe(true);
    expect(androidCompassGood(null, 1)).toBe(false);
    expect(androidCompassGood(0, 0)).toBe(false);
    expect(androidCompassGood(undefined, -1)).toBe(true);
  });
});

describe('smoothHeading', () => {
  it('takes the first reading as it is', () => {
    expect(smoothedDeg(smoothHeading(undefined, 120, 0))).toBeCloseTo(120, 6);
  });

  it('averages across north instead of through south', () => {
    let s = smoothHeading(undefined, 350, 0);
    s = smoothHeading(s, 10, 300);
    expect(headingDelta(smoothedDeg(s), 0)).toBeLessThan(10);
  });

  it('follows a turn within about a second', () => {
    let s = smoothHeading(undefined, 0, 0);
    for (let t = 60; t <= 1200; t += 60) s = smoothHeading(s, 90, t);
    expect(smoothedDeg(s)).toBeGreaterThan(85);
  });

  it('damps a single jolt', () => {
    let s = smoothHeading(undefined, 0, 0);
    s = smoothHeading(s, 0, 60);
    s = smoothHeading(s, 40, 120);
    expect(headingDelta(smoothedDeg(s), 0)).toBeLessThan(10);
  });

  it('starts over after a gap', () => {
    const s = smoothHeading(smoothHeading(undefined, 0, 0), 90, 5000);
    expect(smoothedDeg(s)).toBeCloseTo(90, 6);
  });
});

describe('headingDelta', () => {
  it('measures the short way round', () => {
    expect(headingDelta(350, 10)).toBeCloseTo(20);
    expect(headingDelta(10, 350)).toBeCloseTo(20);
    expect(headingDelta(0, 180)).toBeCloseTo(180);
  });
});

describe('nextCompassTrust', () => {
  it('takes the first reading at once', () => {
    expect(nextCompassTrust(undefined, true, 0).good).toBe(true);
    expect(nextCompassTrust(undefined, false, 0).good).toBe(false);
  });

  it('holds through a short run of disagreeing readings', () => {
    let t = nextCompassTrust(undefined, true, 0);
    t = nextCompassTrust(t, false, 100);
    t = nextCompassTrust(t, false, 1000);
    expect(t.good).toBe(true);
    t = nextCompassTrust(t, true, 1100);
    t = nextCompassTrust(t, false, 1700);
    expect(t.good).toBe(true);
  });

  it('changes once readings disagree for long enough', () => {
    let t = nextCompassTrust(undefined, true, 0);
    t = nextCompassTrust(t, false, 100);
    t = nextCompassTrust(t, false, 1700);
    expect(t.good).toBe(false);
  });
});
