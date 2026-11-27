/** Build facts from app.config.ts `extra`. No Firebase imports here, so any layer can use it. */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  useEmulators?: boolean;
  androidMapsConfigured?: boolean;
  googleWebClientId?: string;
};

/** The project's web OAuth client for Google sign-in (app.config.ts). */
export const googleWebClientId = extra.googleWebClientId ?? 'autoDetect';

/** True when the build carries the emulator-only Firebase config (app.config.ts). */
export const usingEmulators = extra.useEmulators === true;

/** Android's map needs a Google Maps key; without one screens show a placeholder. */
export const mapsAvailable = Platform.OS === 'ios' || extra.androidMapsConfigured === true;

/** Dev-only helpers ("Simulate arrive", test sign-in) are shown in debug builds only. */
export const devTools = __DEV__;
