/**
 * The compass behind P3's arrow (m1-design §9).
 *
 * - iPhone: Core Location's heading, through expo-location.
 * - Android: the fused rotation-vector sensor, through modules/qualk-heading. expo-location's
 *   Android heading comes from the raw accelerometer and magnetometer, which jumps with every
 *   step, swings when the phone is upright, and reports the accelerometer's accuracy as if it
 *   were the compass's. On an Android phone without the fused sensor the screen shows the text
 *   direction ("to the north-east") instead of an arrow.
 *
 * Readings are smoothed, and trust has a short hold, in one shared store, so the screen and
 * the arrow see the same values from a single sensor subscription. The arrow re-renders on its
 * own; the screen only when trust changes.
 */
import {
  androidCompassGood,
  bearingDeg,
  headingFromRotationMatrix,
  nextCompassTrust,
  smoothedDeg,
  smoothHeading,
  type CompassTrust,
  type LatLng,
  type SmoothedHeading,
} from '@qualk/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import QualkHeading from '../../modules/qualk-heading';
import type { Fix } from './position';

export interface CompassState {
  /** Smoothed direction the holder faces, in degrees clockwise from north. */
  headingDeg: number;
  /** Good enough to point an arrow with. */
  trusted: boolean;
}

type Listener = (state: CompassState) => void;

const listeners = new Set<Listener>();
let stopSource: (() => void) | undefined;
let smoothed: SmoothedHeading | undefined;
let trust: CompassTrust | undefined;
let current: CompassState | undefined;
let declinationDeg = 0;
let declinationAt: LatLng | undefined;

function emit() {
  if (!current) return;
  for (const listener of listeners) listener(current);
}

function publish(headingDeg: number, good: boolean) {
  const now = Date.now();
  smoothed = smoothHeading(smoothed, headingDeg, now);
  trust = nextCompassTrust(trust, good, now);
  current = { headingDeg: smoothedDeg(smoothed), trusted: trust.good };
  emit();
}

/** A reading with no usable heading (the phone is on its side): only trust can change. */
function publishNoHeading() {
  if (!current) return;
  trust = nextCompassTrust(trust, false, Date.now());
  current = { headingDeg: current.headingDeg, trusted: trust.good };
  emit();
}

function fusedAndroidCompass() {
  if (Platform.OS !== 'android' || !QualkHeading) return null;
  try {
    return QualkHeading.isAvailable() ? QualkHeading : null;
  } catch {
    return null;
  }
}

function startSource(): () => void {
  if (Platform.OS === 'android') {
    const fused = fusedAndroidCompass();
    if (!fused) return () => {};
    const sub = fused.addListener('onRotation', (e) => {
      const magnetic = headingFromRotationMatrix(e.matrix);
      if (magnetic === undefined) {
        publishNoHeading();
        return;
      }
      publish((magnetic + declinationDeg + 360) % 360, androidCompassGood(e.accuracyDeg, e.status));
    });
    return () => sub.remove();
  }

  let sub: Location.LocationSubscription | undefined;
  let cancelled = false;
  Location.watchHeadingAsync((h) => {
    const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
    // iOS reports 3 for < 20° uncertainty and 2 for < 35°.
    publish(deg, h.accuracy >= 2);
  })
    .then((s) => {
      if (cancelled) s.remove();
      else sub = s;
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    sub?.remove();
  };
}

/** Listens to the shared compass. The sensor runs while anyone listens. */
export function subscribeCompass(listener: Listener): () => void {
  listeners.add(listener);
  if (current) listener(current);
  if (listeners.size === 1) stopSource = startSource();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopSource?.();
      stopSource = undefined;
      smoothed = undefined;
      trust = undefined;
      current = undefined;
    }
  };
}

/**
 * Android's sensor measures from magnetic north; this turns it to true north for where the
 * walk is (about 4° in Denmark). iOS does this itself.
 */
export function setCompassPosition(at: LatLng) {
  if (Platform.OS !== 'android' || !QualkHeading) return;
  if (
    declinationAt &&
    Math.abs(declinationAt.latitude - at.latitude) < 0.5 &&
    Math.abs(declinationAt.longitude - at.longitude) < 0.5
  ) {
    return;
  }
  try {
    declinationDeg = QualkHeading.declination(at.latitude, at.longitude);
    declinationAt = { latitude: at.latitude, longitude: at.longitude };
  } catch {
    // Keep the magnetic heading; a few degrees off is still a useful arrow.
  }
}

export interface Heading {
  /** Bearing from here to the target, 0 = north. */
  bearingToTarget?: number;
  /** The compass is good enough to show the arrow; otherwise show the text direction. */
  reliable: boolean;
}

/**
 * Whether P3 can show the arrow, and the bearing for it or for the text direction. The arrow
 * itself (CompassArrow) follows the heading; this only re-renders the screen when trust
 * changes.
 */
export function useHeading(
  from: Fix | undefined,
  target: LatLng | undefined,
  enabled = true,
): Heading {
  const [trusted, setTrusted] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const stop = subscribeCompass((s) => setTrusted(s.trusted));
    return () => {
      stop();
      setTrusted(false);
    };
  }, [enabled]);

  const lat = from?.latitude;
  const lng = from?.longitude;
  useEffect(() => {
    if (lat !== undefined && lng !== undefined) {
      setCompassPosition({ latitude: lat, longitude: lng });
    }
  }, [lat, lng]);

  if (!from || !target) return { reliable: false };
  return { bearingToTarget: bearingDeg(from, target), reliable: trusted };
}
