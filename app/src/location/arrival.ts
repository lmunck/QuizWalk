/**
 * useArrival and useHeading (m1-design §9). All distance and radius arithmetic comes from
 * @qualk/shared; this file only feeds it fixes.
 */
import {
  bearingDeg,
  canUnlock,
  canUseImHere,
  distanceM,
  effectiveRadiusM,
  MAX_UNLOCK_ACCURACY_M,
  type LatLng,
} from '@qualk/shared';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';

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

export interface Heading {
  /** Bearing from here to the target, 0 = north. */
  bearingToTarget?: number;
  /** Rotation for an arrow that points at the target, relative to where the phone points. */
  arrowDeg?: number;
  /** The compass is calibrated well enough to trust the arrow; otherwise show text. */
  reliable: boolean;
}

/** The compass, relative to a target (P3's arrow). Falls back to a text bearing when unreliable. */
export function useHeading(
  from: Fix | undefined,
  target: LatLng | undefined,
  enabled = true,
): Heading {
  const [heading, setHeading] = useState<{ deg: number; accuracy: number }>();

  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    Location.watchHeadingAsync((h) => {
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      setHeading({ deg, accuracy: h.accuracy });
    })
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => setHeading(undefined));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);

  if (!from || !target) return { reliable: false };
  const bearingToTarget = bearingDeg(from, target);
  // iOS reports 3 for < 20° uncertainty and 2 for < 35°; Android uses the same 0–3 scale.
  const reliable = heading !== undefined && heading.accuracy >= 2;
  return {
    bearingToTarget,
    arrowDeg: heading ? (bearingToTarget - heading.deg + 360) % 360 : undefined,
    reliable,
  };
}
