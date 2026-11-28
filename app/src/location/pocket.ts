/**
 * Pocket mode (spec §9, M3): the walk goes on with the phone in a pocket. Location keeps coming
 * in the background, the GPS works hard only within 300 m of the stop, and reaching the stop
 * buzzes with a notification that opens the question (P4).
 *
 * Only "When In Use" / "While using the app" location is used. Both platforms allow background
 * updates that were started while the app was on screen: iOS with the `location` background
 * mode and the blue indicator, Android with a foreground service and its notification
 * ("Guiding you to stop 4"). Which mechanism runs is `POCKET_ENGINE` in `tuning.ts`.
 *
 * Screens see none of this: fixes reach the same listeners as the on-screen watch
 * (`position.ts`), and P3 asks `usePocketMode` only whether it may promise a buzz.
 */
import { pocketAccuracyStep, type LatLng, type PocketAccuracy } from '@qualk/shared';
import * as Location from 'expo-location';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { notificationsAllowed, notifyArrival, prepareArrivalNotifications } from '@/lib/push';
import { colors } from '@/theme/tokens';

import { arrivalFor } from './arrival';
import { emitPocketFix, latestFix, type Fix } from './position';
import {
  ANDROID_TASK_STEP,
  FAR_AGAIN_M,
  NEAR_STOP_M,
  POCKET_ENGINE,
  POCKET_STEPS,
  type PocketEngine,
} from './tuning';

/** The task name for `TaskManager.defineTask` (src/tasks.ts). */
export const POCKET_TASK = 'qualk-pocket-mode';

export interface PocketTarget {
  walkId: string;
  walkTitle: string;
  stopId: string;
  stopNumber: number;
  placeName?: string;
  location: LatLng;
  radiusM: number;
}

/** Why pocket mode is off, so P3 can say the right thing. */
export type PocketOff = 'notWalking' | 'engineOff' | 'noNotifications' | 'noLocation' | 'failed';

export type PocketState = { on: true } | { on: false; why: PocketOff };

const ENGINE: PocketEngine =
  Platform.OS === 'ios'
    ? POCKET_ENGINE.ios
    : Platform.OS === 'android'
      ? POCKET_ENGINE.android
      : 'off';

/** Pocket mode exists in this build (it can still be off on a walk; see `PocketState`). */
export const pocketModeAvailable = ENGINE !== 'off';

// ------------------------------------------------------------------ state

let state: PocketState = { on: false, why: 'notWalking' };
const stateListeners = new Set<() => void>();
function setState(next: PocketState) {
  if (next.on === state.on && (next.on || state.on || next.why === state.why)) return;
  state = next;
  stateListeners.forEach((l) => l());
}

let target: PocketTarget | undefined;
let running: PocketEngine = 'off';
let step: PocketAccuracy = 'near';
/** The stop whose arrival has been announced, so it buzzes once. */
let announced: string | undefined;
/** P3 is the screen in front: it opens the question itself on arrival. */
let walkScreenFocused = false;
/** Some screen asked for pocket mode since launch (see `releaseStalePocketMode`). */
let claimed = false;

/** Start, update and stop run one at a time, in the order they were asked for. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

const targetKey = (t: PocketTarget) => `${t.walkId}/${t.stopId}`;

/** Development builds log what pocket mode does, for field tests with a dev build. */
const trace = (...args: unknown[]) => {
  if (__DEV__) console.log('[pocket]', ...args);
};
const notificationTitle = (t: PocketTarget) => `Guiding you to stop ${t.stopNumber}`;
const notificationBody = (t: PocketTarget) =>
  `${t.walkTitle}. Your phone buzzes when you get there.`;

// ------------------------------------------------------------------ engine: task

function taskOptions(t: PocketTarget, s: PocketAccuracy): Location.LocationTaskOptions {
  const knobs = Platform.OS === 'android' ? ANDROID_TASK_STEP : POCKET_STEPS[s];
  return {
    accuracy: knobs.accuracy,
    distanceInterval: knobs.distanceIntervalM,
    timeInterval: knobs.timeIntervalMs,
    activityType: Location.ActivityType.Fitness,
    // A paused update never resumes in the background on "When In Use".
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: notificationTitle(t),
      notificationBody: notificationBody(t),
      notificationColor: colors.accent,
      killServiceOnDestroy: true,
    },
  };
}

const taskEngine = {
  async start(t: PocketTarget, s: PocketAccuracy) {
    // Registering again with the same name only changes the options.
    await Location.startLocationUpdatesAsync(POCKET_TASK, taskOptions(t, s));
  },
  async update(t: PocketTarget, s: PocketAccuracy) {
    try {
      await Location.startLocationUpdatesAsync(POCKET_TASK, taskOptions(t, s));
    } catch (err) {
      // Android refuses new options while the app is in the background; the old ones carry on.
      if (AppState.currentState === 'active') throw err;
    }
  },
  async stop() {
    if (await Location.hasStartedLocationUpdatesAsync(POCKET_TASK).catch(() => false)) {
      await Location.stopLocationUpdatesAsync(POCKET_TASK);
    }
  },
};

/** Fixes delivered to the task (src/tasks.ts), oldest first. */
export function handlePocketTask(data: unknown, error: unknown): void {
  if (error) {
    // iOS reports the significant-change monitor it cannot use on "When In Use" here; the
    // ordinary updates carry on regardless.
    console.warn('Pocket mode update error', error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  locations?.forEach((loc) =>
    onPocketFix({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracyM: loc.coords.accuracy ?? Number.POSITIVE_INFINITY,
      atMs: loc.timestamp,
    }),
  );
}

// ------------------------------------------------------------------ engine: session (Android)

type Next = typeof import('expo-location/next');
type Watcher = ReturnType<Next['Location']['watchPosition']>;
let watcher: Watcher | undefined;

/** Loaded on first use: the newer API is only needed on Android. */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a lazy load, on Android only
const next = (): Next => require('expo-location/next') as Next;

function applyWatcherStep(w: Watcher, s: PocketAccuracy) {
  const knobs = POCKET_STEPS[s];
  const { LocationProfile } = next();
  w.withProfile(knobs.profile === 'fitness' ? LocationProfile.FITNESS : LocationProfile.DEFAULT)
    .withInterval(knobs.intervalS)
    .restart();
}

const sessionEngine = {
  async start(t: PocketTarget, s: PocketAccuracy) {
    const { Location: L } = next();
    await L.ensureBackgroundSessionStarted({
      notificationTitle: notificationTitle(t),
      notificationBody: notificationBody(t),
      notificationColor: parseInt(colors.accent.slice(1), 16),
      // Swiping QuizWalk away ends the walk's tracking, and the notification with it.
      stopOnTaskRemoved: true,
    });
    watcher?.dispose();
    watcher = L.watchPosition({
      onPosition: (p) =>
        onPocketFix({
          latitude: p.coordinates.latitude,
          longitude: p.coordinates.longitude,
          accuracyM: p.horizontalAccuracy ?? Number.POSITIVE_INFINITY,
          atMs: p.timestamp,
        }),
      onError: (e) => console.warn('Pocket mode watch error', e.code, e.message),
    });
    applyWatcherStep(watcher, s);
  },
  async update(t: PocketTarget, s: PocketAccuracy) {
    // Re-posts the notification; allowed in the background while the session runs.
    await next()
      .Location.ensureBackgroundSessionStarted({
        notificationTitle: notificationTitle(t),
        notificationBody: notificationBody(t),
        notificationColor: parseInt(colors.accent.slice(1), 16),
        stopOnTaskRemoved: true,
      })
      .catch((err: unknown) => console.warn('Pocket mode notification update failed', err));
    if (watcher) applyWatcherStep(watcher, s);
  },
  async stop() {
    watcher?.dispose();
    watcher = undefined;
    if (Platform.OS !== 'android') return;
    const { Location: L, BackgroundSessionState } = next();
    if (L.getBackgroundSessionStatus().state !== BackgroundSessionState.NOT_RUNNING) {
      await L.stopBackgroundSession();
    }
  },
};

const engines = { task: taskEngine, session: sessionEngine } as const;

// ------------------------------------------------------------------ fixes and arrival

function onPocketFix(fix: Fix): void {
  emitPocketFix(fix);
  const t = target;
  if (!t || running === 'off') return;
  const arrival = arrivalFor(fix, t);
  trace(
    AppState.currentState,
    `stop ${t.stopNumber}`,
    `${Math.round(arrival.distanceM ?? NaN)} m`,
    `±${Math.round(fix.accuracyM)} m`,
    step,
  );

  const wanted = pocketAccuracyStep(arrival.distanceM, step, NEAR_STOP_M, FAR_AGAIN_M);
  if (wanted !== step) {
    trace(`accuracy ${step} → ${wanted}`);
    step = wanted;
    const engine = running;
    void serial(() => engines[engine].update(t, wanted)).catch((err: unknown) =>
      console.warn('Pocket mode step change failed', err),
    );
  }

  if (arrival.unlocked && announced !== targetKey(t)) {
    announced = targetKey(t);
    // On screen, P3 opens the question itself (with its own buzz).
    if (AppState.currentState === 'active' && walkScreenFocused) return;
    trace(`arrived at stop ${t.stopNumber}: notification`);
    void notifyArrival({
      walkId: t.walkId,
      stopId: t.stopId,
      stopNumber: t.stopNumber,
      placeName: t.placeName,
    });
  }
}

function initialStep(t: PocketTarget): PocketAccuracy {
  const fix = latestFix();
  return pocketAccuracyStep(fix ? arrivalFor(fix, t).distanceM : undefined, 'far');
}

// ------------------------------------------------------------------ start and stop

async function ensure(t: PocketTarget): Promise<void> {
  const previous = target;
  target = t;
  if (ENGINE === 'off') return setState({ on: false, why: 'engineOff' });

  const location = await Location.getForegroundPermissionsAsync().catch(() => undefined);
  if (!location?.granted) {
    await stopEngine();
    return setState({ on: false, why: 'noLocation' });
  }
  // No buzz without notifications, and a pocket mode that cannot buzz would be a false promise.
  if (!(await notificationsAllowed())) {
    await stopEngine();
    return setState({ on: false, why: 'noNotifications' });
  }

  if (running === ENGINE) {
    if (previous && targetKey(previous) === targetKey(t)) return setState({ on: true });
    step = initialStep(t);
    await engines[ENGINE].update(t, step);
    trace(`now guiding to stop ${t.stopNumber}, ${step}`);
    return setState({ on: true });
  }

  // Android only starts a foreground service while the app is on screen.
  if (AppState.currentState !== 'active') return;
  try {
    await prepareArrivalNotifications();
    step = initialStep(t);
    await engines[ENGINE].start(t, step);
    running = ENGINE;
    trace(`started (${ENGINE}), stop ${t.stopNumber}, ${step}`);
    setState({ on: true });
  } catch (err) {
    console.warn('Pocket mode could not start', err);
    await engines[ENGINE].stop().catch(() => undefined);
    running = 'off';
    setState({ on: false, why: 'failed' });
  }
}

async function stopEngine(): Promise<void> {
  // Both, so a switch of POCKET_ENGINE between builds leaves nothing running.
  await Promise.all([
    taskEngine.stop().catch((err: unknown) => console.warn('Pocket mode stop failed', err)),
    sessionEngine.stop().catch((err: unknown) => console.warn('Pocket mode stop failed', err)),
  ]);
  running = 'off';
}

/** Ends pocket mode: the team finished or left, or the walk ended. */
export function stopPocketMode(): Promise<void> {
  return serial(async () => {
    target = undefined;
    announced = undefined;
    await stopEngine();
    trace('stopped');
    setState({ on: false, why: 'notWalking' });
  });
}

/**
 * At launch: background updates registered by an earlier run (iOS restores them by itself)
 * are stopped unless the walk screen has already asked for them again.
 */
export function releaseStalePocketMode(): void {
  if (!claimed) void stopPocketMode();
}

/** P3 tells pocket mode when it is the screen in front (it handles arrival itself then). */
export function setWalkScreenFocused(focused: boolean): void {
  walkScreenFocused = focused;
}

/**
 * P3: pocket mode while the team is walking, guiding to `stop`. Returns whether the phone can
 * really buzz at the stop, which decides P3's copy and whether the screen is kept awake.
 */
export function usePocketMode(
  t: PocketTarget | undefined,
  /** `undefined` while the walk is still loading: nothing is started or stopped then. */
  walking: boolean | undefined,
): PocketState {
  const current = useSyncExternalStore(
    (l) => {
      stateListeners.add(l);
      return () => stateListeners.delete(l);
    },
    () => state,
  );

  // Permissions can change in Settings while the app is away: check again on return.
  const [resumed, setResumed] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setResumed((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  const key = t ? targetKey(t) : undefined;
  useEffect(() => {
    claimed = true;
    if (walking === undefined) return;
    if (!walking) {
      void stopPocketMode();
      return;
    }
    if (!t) return;
    void serial(() => ensure(t)).catch((err: unknown) =>
      console.warn('Pocket mode update failed', err),
    );
    // The key, title and place describe the target; `t` itself is a new object every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    walking,
    key,
    t?.walkTitle,
    t?.placeName,
    t?.location.latitude,
    t?.location.longitude,
    t?.radiusM,
    resumed,
  ]);

  return walking ? current : { on: false, why: 'notWalking' };
}
