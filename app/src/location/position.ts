/**
 * Foreground location (spec §9, m1-design §9). One watch is shared by every screen that needs
 * a position, so P3, the map and the position uploader never start two. M3 swaps this for
 * background updates without touching a screen.
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

export interface Fix {
  latitude: number;
  longitude: number;
  /** Metres; Infinity when the platform gives none. */
  accuracyM: number;
  atMs: number;
}

export type LocationAccess =
  | { status: 'granted'; precise: boolean }
  | { status: 'undetermined' }
  | { status: 'denied'; canAskAgain: boolean };

function accessFrom(res: Location.LocationPermissionResponse): LocationAccess {
  if (res.status === 'granted') {
    const precise =
      Platform.OS === 'ios' ? res.ios?.accuracy !== 'reduced' : res.android?.accuracy !== 'coarse';
    return { status: 'granted', precise };
  }
  if (res.status === 'undetermined') return { status: 'undetermined' };
  return { status: 'denied', canAskAgain: res.canAskAgain };
}

export async function getLocationAccess(): Promise<LocationAccess> {
  return accessFrom(await Location.getForegroundPermissionsAsync());
}

export async function requestLocationAccess(): Promise<LocationAccess> {
  return accessFrom(await Location.requestForegroundPermissionsAsync());
}

/** Location and precise location are switched on in the phone's settings for the app. */
export function openAppSettings(): void {
  void Linking.openSettings();
}

/** Permission state that refreshes when asked. */
export function useLocationAccess(): [LocationAccess | undefined, () => Promise<LocationAccess>] {
  const [access, setAccess] = useState<LocationAccess>();
  useEffect(() => {
    void getLocationAccess().then(setAccess);
  }, []);
  const request = async () => {
    const next = await requestLocationAccess();
    setAccess(next);
    return next;
  };
  return [access, request];
}

// ------------------------------------------------------------------ the shared watch

type Listener = (fix: Fix) => void;
const listeners = new Set<Listener>();
let subscription: Location.LocationSubscription | undefined;
let starting = false;
let lastFix: Fix | undefined;
/** Dev builds: a position set by "Simulate arrive" overrides the GPS until cleared. */
let simulated: Fix | undefined;

function emit(fix: Fix) {
  lastFix = fix;
  listeners.forEach((l) => l(simulated ?? fix));
}

async function startWatch() {
  if (subscription || starting) return;
  starting = true;
  try {
    const access = await getLocationAccess();
    if (access.status !== 'granted') return;
    subscription = await Location.watchPositionAsync(
      // Balanced is "within one hundred metres", useless against a 25–60 m radius (m1-design §9).
      { accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 2_000 },
      (loc) =>
        emit({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracyM: loc.coords.accuracy ?? Number.POSITIVE_INFINITY,
          atMs: loc.timestamp,
        }),
    );
    if (listeners.size === 0) stopWatch();
  } catch (err) {
    console.warn('Location watch failed', err);
  } finally {
    starting = false;
  }
}

function stopWatch() {
  subscription?.remove();
  subscription = undefined;
}

/** Subscribe to fixes. The watch runs while at least one subscriber exists. */
export function subscribeToPosition(listener: Listener): () => void {
  listeners.add(listener);
  const current = simulated ?? lastFix;
  if (current) listener(current);
  void startWatch();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopWatch();
  };
}

/** The latest fix, live. `enabled: false` stops listening (e.g. once a walk is finished). */
export function usePosition(enabled = true): Fix | undefined {
  const [fix, setFix] = useState<Fix | undefined>(enabled ? (simulated ?? lastFix) : undefined);
  useEffect(() => {
    if (!enabled) return;
    return subscribeToPosition(setFix);
  }, [enabled]);
  return fix;
}

/** Restart the watch after permission was granted on this screen. */
export function restartPositionWatch(): void {
  stopWatch();
  if (listeners.size > 0) void startWatch();
}

/** Dev builds only: pretend to stand at a point with good GPS ("Simulate arrive"). */
export function simulatePosition(at: { latitude: number; longitude: number } | undefined): void {
  simulated = at
    ? { latitude: at.latitude, longitude: at.longitude, accuracyM: 5, atMs: Date.now() }
    : undefined;
  const fix = simulated ?? lastFix;
  if (fix) listeners.forEach((l) => l(fix));
}
