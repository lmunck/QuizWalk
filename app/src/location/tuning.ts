/**
 * Location and battery knobs, in one place (spec §9 Battery). Every number here is a starting
 * point: the field tests on real phones set the final values. What each one costs and why it
 * has its value is in docs/m2-m3-delivery.md, "Battery knobs".
 */
import { POCKET_FAR_AGAIN_M, POCKET_NEAR_STOP_M } from '@qualk/shared';
import * as Location from 'expo-location';

// ------------------------------------------------------------------ which pocket mode ships

/**
 * How a stop is found while the phone is in a pocket (spec §9). This is the one switch to
 * flip after the field test:
 *
 * - `task`: background location updates through `expo-task-manager`
 *   (`startLocationUpdatesAsync`). On iOS this is a CLLocationManager with background updates
 *   and the blue indicator, on "When In Use". On Android it runs a foreground service, also on
 *   "While using the app", but Android refuses to change its settings while the app is in the
 *   background, so it cannot step accuracy down far from a stop and stays on high accuracy.
 * - `session`: Android only. expo-location's newer API: a foreground-service "background
 *   session" keeps an ordinary position watch running in the background, and the watch can
 *   change accuracy at any time. Same permission as `task`, less battery.
 * - `off`: no pocket mode. The screen stays on and P3 says "Keep QuizWalk open" (§9 fallback 4,
 *   which is how M1 and M2 played).
 *
 * The app also falls back to `off` by itself, on a walk, when notifications are not allowed
 * (no way to buzz) or when the background updates fail to start.
 */
export type PocketEngine = 'task' | 'session' | 'off';

export const POCKET_ENGINE: { ios: PocketEngine; android: PocketEngine } = {
  ios: 'task',
  android: 'session',
};

// ------------------------------------------------------------------ on screen

/**
 * The watch while QuizWalk is on screen (P2, P3, C4 *Add stop here*). High accuracy, because
 * Balanced is "within one hundred metres" and useless against a 25–60 m radius
 * (m1-design §9). It stops by itself when the app goes to the background.
 */
export const FOREGROUND_WATCH = {
  accuracy: Location.Accuracy.High,
  /** Metres moved before a new fix is delivered. */
  distanceIntervalM: 2,
  /** Android: milliseconds between fixes. iOS ignores it. */
  timeIntervalMs: 2_000,
};

// ------------------------------------------------------------------ in a pocket

/** Within this distance of the stop the GPS works hard (spec §9: 300 m). */
export const NEAR_STOP_M = POCKET_NEAR_STOP_M;
/** Beyond this it eases off again. The gap stops it flipping on every fix near the line. */
export const FAR_AGAIN_M = POCKET_FAR_AGAIN_M;

/**
 * The two accuracy steps in a pocket. `far` follows spec §9 (balanced accuracy, 10 m distance
 * filter); `near` is what unlocking needs.
 *
 * - `accuracy`: iOS Balanced is about 100 m (Wi-Fi and cell, GPS mostly off), High about 10 m.
 *   Android Balanced is "block level" from the fused provider, High uses GPS.
 * - `distanceIntervalM`: the phone wakes the app only after moving this far.
 * - `timeIntervalMs`: Android only, the most often a fix arrives.
 * - `profile` and `intervalS`: the same two steps for the Android `session` engine, which takes
 *   a use case instead of an accuracy: `default` is balanced, `fitness` is high accuracy.
 */
export const POCKET_STEPS = {
  far: {
    accuracy: Location.Accuracy.Balanced,
    distanceIntervalM: 10,
    timeIntervalMs: 10_000,
    profile: 'default',
    intervalS: 10,
  },
  near: {
    accuracy: Location.Accuracy.High,
    distanceIntervalM: 5,
    timeIntervalMs: 3_000,
    profile: 'fitness',
    intervalS: 3,
  },
} as const;

/**
 * The Android `task` engine cannot change its settings in the background (see `PocketEngine`),
 * so it keeps one setting for the whole walk, good enough to unlock a stop.
 */
export const ANDROID_TASK_STEP = POCKET_STEPS.near;
