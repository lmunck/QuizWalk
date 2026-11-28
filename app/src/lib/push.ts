/**
 * Notifications (spec §11): push permission and token, the local "you're at the stop"
 * notification of pocket mode (§9), and where a tapped notification leads. Permission is asked
 * where its use is obvious, never straight after location. A refusal is respected and never
 * blocks play.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { notificationHref } from './routes';

export type PushAsk = 'granted' | 'denied' | 'unavailable';

/** Android channels. Remote pushes from the server use `default` (Expo's own fallback). */
const WALK_UPDATES_CHANNEL = 'default';
export const ARRIVALS_CHANNEL = 'arrivals';
/** A buzz the player can feel through a coat: long, short gap, long. */
const ARRIVAL_VIBRATION = [0, 400, 200, 400];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function pushPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  const res = await Notifications.getPermissionsAsync();
  if (res.granted) return 'granted';
  return res.canAskAgain ? 'undetermined' : 'denied';
}

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(WALK_UPDATES_CHANNEL, {
    name: 'Walk updates',
    // eslint-disable-next-line import/namespace -- re-exported from a .d.ts the plugin can't follow
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(ARRIVALS_CHANNEL, {
    name: 'Arriving at a stop',
    description: 'A buzz when you reach the next stop of a walk.',
    // eslint-disable-next-line import/namespace -- re-exported from a .d.ts the plugin can't follow
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: ARRIVAL_VIBRATION,
    enableVibrate: true,
    sound: 'default',
  });
}

async function expoPushToken(): Promise<string> {
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Asks (if needed) and returns an Expo push token, or why there is none. */
export async function requestPushToken(): Promise<{ status: PushAsk; token?: string }> {
  try {
    await ensureChannels();
    const current = await Notifications.getPermissionsAsync();
    const asked = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!asked.granted) return { status: 'denied' };
    return { status: 'granted', token: await expoPushToken() };
  } catch (err) {
    // Simulators, and builds without push credentials (spec §18, M2), end up here.
    console.warn('Push token unavailable', err);
    return { status: 'unavailable' };
  }
}

/**
 * The token, without asking, when notifications are already allowed (from an earlier walk, or
 * in Settings). Tokens can change, and a new team or walk needs its own copy.
 */
export async function pushTokenIfAllowed(): Promise<string | undefined> {
  try {
    if ((await pushPermission()) !== 'granted') return undefined;
    await ensureChannels();
    return await expoPushToken();
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------ arrival (pocket mode)

/** Pocket mode can only buzz with notifications allowed. */
export async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function prepareArrivalNotifications(): Promise<void> {
  await ensureChannels().catch(() => undefined);
}

/** "You're at stop 4", with a buzz. Tapping it opens the question (P4). */
export async function notifyArrival(a: {
  walkId: string;
  stopId: string;
  stopNumber: number;
  placeName?: string;
}): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `You're at stop ${a.stopNumber}`,
        body: a.placeName
          ? `${a.placeName}. Tap to open the question.`
          : 'Tap to open the question.',
        data: { kind: 'arrived', walkId: a.walkId, stopId: a.stopId },
        sound: 'default',
        vibrate: ARRIVAL_VIBRATION,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: Platform.OS === 'android' ? { channelId: ARRIVALS_CHANNEL } : null,
    });
  } catch (err) {
    console.warn('Arrival notification failed', err);
  }
}

// ------------------------------------------------------------------ tapping a notification

/**
 * A tapped notification opens where it points (results, the monitor, the question). Covers a
 * tap that launched the app as well as one while it was running. `ready`: signed in and the
 * screens are mounted.
 */
export function useNotificationRouting(ready: boolean): void {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string>(undefined);
  useEffect(() => {
    if (!ready || !last) return;
    if (last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const href = notificationHref(last.notification.request.content.data);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    if (!href) return;
    // Let the first screen settle (a cold start lands on Home first), then go.
    const t = setTimeout(() => router.push(href), 50);
    return () => clearTimeout(t);
  }, [ready, last]);
}
