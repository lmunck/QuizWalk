import { describe, expect, it } from 'vitest';

import {
  directionsUrl,
  POCKET_FAR_AGAIN_M,
  POCKET_NEAR_STOP_M,
  pocketAccuracyStep,
} from './pocket';

describe('pocketAccuracyStep', () => {
  it('works hard within 300 m of the stop and eases off beyond 400 m', () => {
    expect(POCKET_NEAR_STOP_M).toBe(300);
    expect(pocketAccuracyStep(1200, 'far')).toBe('far');
    expect(pocketAccuracyStep(300, 'far')).toBe('near');
    expect(pocketAccuracyStep(20, 'far')).toBe('near');
    expect(pocketAccuracyStep(POCKET_FAR_AGAIN_M + 1, 'near')).toBe('far');
  });

  it('keeps the current step between the two lines', () => {
    expect(pocketAccuracyStep(350, 'far')).toBe('far');
    expect(pocketAccuracyStep(350, 'near')).toBe('near');
    expect(pocketAccuracyStep(400, 'near')).toBe('near');
  });

  it('looks harder when the distance is unknown', () => {
    expect(pocketAccuracyStep(undefined, 'far')).toBe('near');
    expect(pocketAccuracyStep(Number.NaN, 'far')).toBe('near');
  });

  it('takes other thresholds', () => {
    expect(pocketAccuracyStep(150, 'far', 100, 200)).toBe('far');
    expect(pocketAccuracyStep(90, 'far', 100, 200)).toBe('near');
    expect(pocketAccuracyStep(201, 'near', 100, 200)).toBe('far');
  });
});

describe('directionsUrl', () => {
  const nyhavn = { latitude: 55.67985, longitude: 12.5906 };

  it('asks Apple Maps for walking directions', () => {
    expect(directionsUrl('apple', nyhavn)).toBe(
      'https://maps.apple.com/?daddr=55.679850,12.590600&dirflg=w',
    );
  });

  it('asks Google Maps for walking directions', () => {
    expect(directionsUrl('google', nyhavn)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=55.679850,12.590600&travelmode=walking',
    );
  });

  it('handles the southern and western hemispheres', () => {
    expect(directionsUrl('google', { latitude: -33.8568, longitude: -151.2153 })).toContain(
      'destination=-33.856800,-151.215300',
    );
  });
});
