import { describe, expect, it } from 'vitest';
import { bearingDeg, countsTowardsDistance, distanceM, shouldUploadPosition } from './geo';

const o = { latitude: 55, longitude: 12 };

describe('distanceM', () => {
  it('is zero for the same point', () => {
    expect(distanceM(o, o)).toBe(0);
  });

  it('measures 1° of latitude, or of longitude on the equator, as ~111.2 km', () => {
    expect(distanceM(o, { latitude: 56, longitude: 12 })).toBeCloseTo(111_195, -1);
    expect(distanceM({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(
      111_195,
      -1,
    );
  });

  it('is symmetric and resolves stop-sized distances', () => {
    const near = { latitude: 55.00036, longitude: 12 }; // ~40 m north
    expect(distanceM(o, near)).toBeCloseTo(40.03, 1);
    expect(distanceM(near, o)).toBe(distanceM(o, near));
  });
});

describe('bearingDeg', () => {
  it('points north, east, south and west', () => {
    expect(bearingDeg(o, { latitude: 56, longitude: 12 })).toBeCloseTo(0, 5);
    expect(bearingDeg(o, { latitude: 55, longitude: 13 })).toBeCloseTo(89.6, 1);
    expect(bearingDeg(o, { latitude: 54, longitude: 12 })).toBeCloseTo(180, 5);
    expect(bearingDeg(o, { latitude: 55, longitude: 11 })).toBeCloseTo(270.4, 1);
  });
});

describe('distance walked and uploads', () => {
  it('ignores poor fixes and jitter', () => {
    expect(countsTowardsDistance(10, 15)).toBe(true);
    expect(countsTowardsDistance(10, 31)).toBe(false);
    expect(countsTowardsDistance(4, 5)).toBe(false);
  });

  it('uploads at most every 30 s and after 20 m', () => {
    expect(shouldUploadPosition(30_000, 20)).toBe(true);
    expect(shouldUploadPosition(29_999, 50)).toBe(false);
    expect(shouldUploadPosition(60_000, 19)).toBe(false);
  });
});
