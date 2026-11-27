/**
 * Push permission and token (spec §11). Asked where its use is obvious, never straight after
 * location. A refusal is respected and never blocks play.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushAsk = 'granted' | 'denied' | 'unavailable';

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

/** Asks (if needed) and returns an Expo push token, or why there is none. */
export async function requestPushToken(): Promise<{ status: PushAsk; token?: string }> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Walk updates',
        // eslint-disable-next-line import/namespace -- re-exported from a .d.ts the plugin can't follow
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const asked = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!asked.granted) return { status: 'denied' };
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { status: 'granted', token: token.data };
  } catch (err) {
    // Simulators, and builds without push credentials (spec §18, M2), end up here.
    console.warn('Push token unavailable', err);
    return { status: 'unavailable' };
  }
}
