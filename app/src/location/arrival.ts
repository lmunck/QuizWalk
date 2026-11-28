/**
 * useArrival (m1-design §9); the compass is in compass.ts. All distance and radius arithmetic
 * comes from @qualk/shared; this file only feeds it fixes.
 */
import {
  canUnlock,
  canUseImHere,
  distanceM,
  effectiveRadiusM,
  MAX_UNLOCK_ACCURACY_M,
  type LatLng,
} from '@qualk/shared';
import { useMemo } from 'react';

import { usePosition, type Fix } from './position';

export interface Arrival {
  fix?: Fix;
  /** Straight-line metres to the stop, once there is a fix. */
  distanceM?: number;
  accuracyM?: number;
  /** Within the effective radius with usable GPS. */
  unlocked: boolean;
  /** "I'm here" is allowed (G6). */
  canImHere: boolean;
  /** GPS accuracy is worse than the stop's radius (G5 Weak GPS). */
  weakGps: boolean;
  /** The radius actually used for unlocking right now. */
  radiusUsedM: number;
}

export function arrivalFor(
  fix: Fix | undefined,
  stop: { location: LatLng; radiusM: number },
): Arrival {
  if (!fix) {
    return { unlocked: false, canImHere: false, weakGps: false, radiusUsedM: stop.radiusM };
  }
  const d = distanceM(fix, stop.location);
  const acc = fix.accuracyM;
  return {
    fix,
    distanceM: d,
    accuracyM: acc,
    unlocked: canUnlock(d, stop.radiusM, acc),
    canImHere: canUseImHere(d, Number.isFinite(acc) ? acc : MAX_UNLOCK_ACCURACY_M),
    weakGps: acc > stop.radiusM,
    radiusUsedM: effectiveRadiusM(stop.radiusM, acc),
  };
}

export function useArrival(
  stop: { location: LatLng; radiusM: number } | undefined,
  enabled = true,
): Arrival {
  const fix = usePosition(enabled && !!stop);
  return useMemo(
    () =>
      stop
        ? arrivalFor(fix, stop)
        : { unlocked: false, canImHere: false, weakGps: false, radiusUsedM: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fix, stop?.location.latitude, stop?.location.longitude, stop?.radiusM],
  );
}
