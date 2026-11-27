/** Haptics (§14): a buzz on arrival, and distinct taps for right and wrong. */
import * as Haptics from 'expo-haptics';

const safe = (p: Promise<void>) => p.catch(() => undefined);

export const buzzArrived = () =>
  safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const tapRight = () =>
  safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const tapWrong = () =>
  safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
export const tapLight = () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
